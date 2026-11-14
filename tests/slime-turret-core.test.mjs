import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD, UPGRADES, RECIPES, describeBall, describeRicochet } from '../src/core.js';

function setup() {
  const events = [];
  const game = new Game({ random: () => 0.999, onEvent: event => events.push(event) }); game.start();
  game._spawnTimer = game._treeTimer = game._oreTimer = Infinity; game.state.resources = [];
  return { game, s: game.state, cue: game.state.balls[0], events };
}
function reward(game, xp = 5) {
  const cue = game.state.balls.find(ball => ball.type === 'cue');
  game._dropExperience(cue.x, cue.y, xp); game.update(0.01);
  assert.equal(game.state.phase, 'upgrade');
  assert.ok(game.state.choices.includes('stationary_turret'));
}
function add(game, type, x = 700, y = 550) { const ball = game._newBall(type, x, y); game.state.balls.push(ball); return ball; }
function forge(game) { Object.assign(game.state.materials, { slimeBall: 3, stone: 2 }); assert.equal(game.craft('slime_block'), true); return game.state.balls.at(-1); }

test('ordinary slime drops supply the new exact-cost recipe, while shop supply is finite and atomic', () => {
  const { game, s } = setup();
  assert.equal(s.materials.slimeBall, 0);
  const large = game._spawnEnemy('slime', { x: 200, y: 150, size: 3 }); game._damage(large, 9999, '#fff');
  assert.equal(s.materials.slimeBall, 2);
  const small = game._spawnEnemy('slime', { x: 250, y: 150, size: 1 }); game._damage(small, 9999, '#fff');
  assert.equal(s.materials.slimeBall, 3);
  assert.deepEqual(RECIPES.find(recipe => recipe.id === 'slime_block').cost, { slimeBall: 3, stone: 2 });
  const stone = s.materials.stone;
  assert.equal(game.craft('slime_block'), true);
  const ball = s.balls.at(-1);
  assert.equal(ball.type, 'slime'); assert.deepEqual(ball.traits, ['slime']);
  assert.equal(s.materials.slimeBall, 0); assert.equal(s.materials.stone, stone - 2);
  Object.assign(s.materials, { iron: 1, stone: 2 });
  assert.equal(game.buyOffer('slime_bundle'), true); assert.equal(s.materials.slimeBall, 3);
  const before = structuredClone(s.materials); assert.equal(game.buyOffer('slime_bundle'), false); assert.deepEqual(s.materials, before);
});

test('slime forging obeys the persistent block cap and native upgrades strengthen existing slime traits', () => {
  const { game, s, cue } = setup(); const slime = forge(game);
  s.stations.anvil = true; assert.equal(game.fuseBlocks(cue.id, slime.id), true);
  assert.ok(cue.traits.includes('slime')); assert.match(describeBall(cue).description, /高弹力/);
  const retention = game._restitution(cue, 0.8);
  game._applyUpgrade('slime');
  assert.ok(game._restitution(cue, 0.8) > retention);
  assert.ok(s.balls.some(ball => ball.type === 'slime' && ball.fusionLevel === 0));
  while (s.balls.length < 18) add(game, 'iron', 100, 100);
  Object.assign(s.materials, { slimeBall: 3, stone: 2 }); const materials = { ...s.materials };
  assert.equal(game.craft('slime_block'), false); assert.deepEqual(s.materials, materials);
});

test('slime retains more speed across walls, the base, resources, crystals and enemies without gaining energy', () => {
  for (const contact of ['wall', 'base', 'resource', 'crystal', 'enemy']) {
    function bounced(type) {
      const { game, s, cue } = setup(); const ball = type === 'cue' ? cue : add(game, type); s.balls = [ball];
      if (contact === 'wall') { Object.assign(ball, { x: 31, y: 200, vx: -700, vy: 0 }); game._ballWalls(ball); }
      if (contact === 'base') { Object.assign(ball, { x: 500, y: 360 + WORLD.baseRadius + ball.r - 1, vx: 0, vy: -700 }); game._ballBase(ball); }
      if (contact === 'resource') { const resource = game._spawnResource('ore', 300, 200, 'obsidian'); Object.assign(ball, { x: 300 - resource.r - ball.r + 1, y: 200, vx: 700, vy: 0 }); game._ballResource(ball, resource); }
      if (contact === 'crystal') { const crystal = { id: 999, x: 300, y: 200, r: 24, hp: 1000, maxHp: 1000, shield: 80 }; Object.assign(ball, { x: 300 - crystal.r - ball.r + 1, y: 200, vx: 700, vy: 0 }); game._ballCrystal(ball, crystal); }
      if (contact === 'enemy') { const enemy = game._spawnEnemy('zombie', { x: 300, y: 200, hp: 1000, speed: 0 }); Object.assign(ball, { x: 300 - enemy.r - ball.r + 1, y: 200, vx: 700, vy: 0 }); game._ballEnemy(ball, enemy); }
      return Math.hypot(ball.vx, ball.vy);
    }
    const normal = bounced('cue'), slime = bounced('slime');
    assert.ok(slime > normal, contact); assert.ok(slime <= 700 + 1e-8, contact);
  }
});

test('slime block collisions transfer more speed and never add kinetic energy for equal masses', () => {
  function collide(type) {
    const { game, s, cue } = setup(); const a = type === 'cue' ? cue : add(game, type, 200, 180);
    const b = add(game, 'cue', 224, 180); s.balls = [a, b];
    Object.assign(a, { x: 200, y: 180, vx: 700, vy: 0, r: 12, mass: 1 });
    Object.assign(b, { vx: 0, vy: 0, r: 13, mass: 1 }); game._ballPair(a, b);
    return { speed: Math.hypot(b.vx, b.vy), energy: a.vx ** 2 + a.vy ** 2 + b.vx ** 2 + b.vy ** 2 };
  }
  const normal = collide('cue'), slime = collide('slime');
  assert.ok(slime.speed > normal.speed); assert.ok(slime.energy <= 700 ** 2 + 1e-7);
});

test('slime shoots faster but remains capped, can be caught and eventually stops under reduced friction', () => {
  const { game, s } = setup(); const slime = forge(game); s.balls = [slime];
  Object.assign(slime, { x: 130, y: 160, vx: 0, vy: 0 });
  assert.equal(game.shoot(0, 1, slime.id), true); assert.ok(slime.vx > 1140); assert.ok(slime.vx <= 1250);
  game.update(0.3); assert.equal(game.beginAim(slime.id), true);
  assert.ok(game.getAimInfo().caughtSpeed > 0); game.cancelAim();
  game.update(3); assert.ok(Math.hypot(slime.vx, slime.vy) > 20);
  game.update(10); assert.equal(Math.hypot(slime.vx, slime.vy), 0);
  assert.ok(slime.traits.includes('slime'));
});

test('a real full-power slime shot makes several more arena rebounds than the same ordinary shot and still stops', () => {
  function trial(type) {
    const { game, s, cue, events } = setup(); const ball = type === 'cue' ? cue : add(game, type);
    s.balls = [ball]; Object.assign(ball, { x: 140, y: 150, vx: 0, vy: 0 });
    game.shoot(0.3, 1, ball.id);
    let elapsed = 0;
    while (elapsed < 12 && Math.hypot(ball.vx, ball.vy) > 0) { game.update(1 / 60); elapsed += 1 / 60; }
    return { bounces: events.filter(event => event.type === 'bounce').length, elapsed, speed: Math.hypot(ball.vx, ball.vy) };
  }
  const normal = trial('cue'), slime = trial('slime');
  assert.ok(slime.bounces >= normal.bounces + 3);
  assert.ok(slime.elapsed > normal.elapsed * 1.5);
  assert.ok(slime.elapsed < 10); assert.equal(slime.speed, 0);
});

test('temporary slime bounce sharing and inherited ghosts remain temporary and do not mutate native traits', () => {
  const { game, s, cue } = setup(); const slime = add(game, 'slime', 222, 180);
  Object.assign(cue, { x: 200, y: 180, vx: 600, vy: 100 }); game._ballPair(cue, slime);
  assert.ok(describeRicochet(cue).traits.includes('slime')); assert.deepEqual(cue.traits, []);
  assert.ok(game._restitution(cue, 0.8) >= 0.96);
  game._clearRicochet(cue); assert.equal(game._restitution(cue, 0.8), 0.8);
  s.upgrades.echo = 1; Object.assign(slime, { x: 250, y: 250, vx: 0, vy: 0 });
  assert.equal(game.shoot(0, 1, slime.id), true);
  const ghost = s.balls.find(ball => ball.type === 'ghost'); assert.ok(ghost.traits.includes('slime'));
  assert.ok(game._restitution(ghost, 0.8) >= 0.96); assert.equal(ghost.enchantments.stationary_turret, undefined);
});

test('slime turret rays have a longer range and extra reflections in both preview and actual fire', () => {
  function beam(slime) {
    const { game, s, cue } = setup();
    Object.assign(cue, { x: 120, y: 180, enchantments: { stationary_turret: 1 }, traits: slime ? ['slime'] : [] });
    const plan = game._beamPlans(cue, 0)[0]; const preview = game.previewBeam(0, cue.id);
    game.beginAim(cue.id); game.advanceAim(0.86); assert.equal(game.shoot(0, 1, cue.id), true);
    assert.deepEqual(s.beams[0].segments, preview.segments);
    return { game, cue, plan };
  }
  const normal = beam(false), slime = beam(true);
  assert.equal(slime.plan.maxBounces, normal.plan.maxBounces + 2);
  assert.ok(Math.abs(slime.plan.range / normal.plan.range - 1.2) < 1e-8);
  assert.ok(slime.game.getBuildInfo(slime.cue.id).combos.find(combo => combo.id === 'beam_slime').active);
});

test('choosing a turret card opens target selection without spending the reward, XP, materials or rerolling', () => {
  const { game, s, cue } = setup(); const redstone = add(game, 'storm'); reward(game);
  const before = structuredClone({ choices: s.choices, pending: s.pendingUpgrades, xp: s.xp, materials: s.materials, bags: s.balls.map(ball => ball.enchantments) });
  assert.equal(game.chooseUpgrade('stationary_turret'), true);
  assert.equal(s.upgradeTarget, 'stationary_turret'); assert.equal(s.phase, 'upgrade');
  assert.deepEqual({ choices: s.choices, pending: s.pendingUpgrades, xp: s.xp, materials: s.materials, bags: s.balls.map(ball => ball.enchantments) }, before);
  assert.equal(game.getUpgradeTargets().find(target => target.id === redstone.id).ok, true);
  assert.equal(game.chooseUpgradeTarget(redstone.id), true);
  assert.equal(s.pendingUpgrades, 0); assert.equal(s.phase, 'playing'); assert.equal(s.upgradeTarget, null);
  assert.equal(redstone.enchantments.stationary_turret, 1); assert.equal(cue.enchantments.stationary_turret, undefined);
  assert.equal(game.chooseUpgradeTarget(redstone.id), false); assert.equal(redstone.enchantments.stationary_turret, 1);
  assert.equal(s.xp, before.xp); assert.deepEqual(s.materials, before.materials);
});

test('canceling a turret target keeps exactly the same cards and earned pending count', () => {
  const { game, s } = setup(); reward(game, 14);
  const choices = [...s.choices], offered = [...game._offeredUpgrades], pending = s.pendingUpgrades;
  for (let repeat = 0; repeat < 3; repeat += 1) {
    assert.equal(game.chooseUpgrade('stationary_turret'), true);
    assert.equal(game.cancelUpgradeTarget(), true);
    assert.deepEqual(s.choices, choices); assert.deepEqual(game._offeredUpgrades, offered);
    assert.equal(s.pendingUpgrades, pending); assert.equal(s.phase, 'upgrade'); assert.equal(s.upgradeTarget, null);
  }
  assert.equal(game.cancelUpgradeTarget(), false);
  assert.equal(game.chooseUpgrade(s.choices.find(id => id !== 'stationary_turret')), true);
  assert.equal(s.pendingUpgrades, pending - 1);
});

test('any legal block can make turret rewards available even when the cue is full, held or maxed', () => {
  for (const reason of ['full', 'held', 'maxed']) {
    const { game, s, cue } = setup();
    if (reason === 'full') cue.enchantments = { power: 1, crit: 1, prism: 1, fire_aspect: 1 };
    if (reason === 'held') cue.heldBy = 900;
    if (reason === 'maxed') cue.enchantments.stationary_turret = 3;
    assert.equal(game._isFreeUpgradeAvailable('stationary_turret'), false, reason);
    const other = add(game, 'slime');
    assert.equal(game._isFreeUpgradeAvailable('stationary_turret'), true, reason);
    s.pendingUpgrades = 1; game._checkLevel();
    assert.ok(s.choices.includes('stationary_turret')); game.chooseUpgrade('stationary_turret');
    assert.equal(game.canChooseUpgradeTarget(cue.id).ok, false);
    assert.equal(game.chooseUpgradeTarget(other.id), true); assert.equal(other.enchantments.stationary_turret, 1);
  }
});

test('confirm revalidates missing, captured, expired, full-slot, maxed, ghost and TNT targets atomically', () => {
  const { game, s, cue } = setup(); const other = add(game, 'iron'); reward(game); game.chooseUpgrade('stationary_turret');
  const ghost = add(game, 'ghost'); ghost.life = 2; const tnt = add(game, 'tnt');
  for (const badId of [999999, ghost.id, tnt.id]) {
    const snapshot = structuredClone(s); assert.equal(game.chooseUpgradeTarget(badId), false); assert.deepEqual(s, snapshot);
  }
  for (const mutation of [ball => { ball.heldBy = 123; }, ball => { ball.life = 0; }, ball => { ball.detonated = true; }, ball => { ball.enchantments = { power: 1, crit: 1, prism: 1, fire_aspect: 1 }; }, ball => { ball.enchantments.stationary_turret = 3; }]) {
    Object.assign(other, { life: undefined, detonated: false, enchantments: {} }); delete other.heldBy;
    mutation(other); const snapshot = structuredClone(s);
    assert.equal(game.chooseUpgradeTarget(other.id), false); assert.deepEqual(s, snapshot);
  }
  s.balls = s.balls.filter(ball => ball !== other); assert.equal(game.chooseUpgradeTarget(other.id), false);
  assert.equal(game.chooseUpgradeTarget(cue.id), true);
});

test('successive earned turret upgrades each require a fresh target confirmation and allow upgrading an occupied slot', () => {
  const { game, s, cue } = setup(); cue.enchantments = { stationary_turret: 1, power: 1, crit: 1, prism: 1 };
  reward(game, 14);
  assert.equal(game.chooseUpgrade('stationary_turret'), true); assert.equal(game.chooseUpgradeTarget(cue.id), true);
  assert.equal(cue.enchantments.stationary_turret, 2); assert.equal(s.pendingUpgrades, 1); assert.equal(s.upgradeTarget, null);
  assert.equal(game.chooseUpgradeTarget(cue.id), false); assert.equal(s.pendingUpgrades, 1);
  assert.equal(game.chooseUpgrade('stationary_turret'), true); assert.equal(game.chooseUpgradeTarget(cue.id), true);
  assert.equal(cue.enchantments.stationary_turret, 3); assert.equal(s.pendingUpgrades, 0);
  assert.equal(game._isFreeUpgradeAvailable('stationary_turret'), false);
});

test('reset, terminal outcomes and realm changes clear pending target selection', () => {
  for (const action of ['reset', 'lost', 'won', 'stage']) {
    const { game, s, cue } = setup(); reward(game); game.chooseUpgrade('stationary_turret');
    if (action === 'reset') game.reset(); else if (action === 'stage') game._changeStage('nether'); else game._end(action);
    assert.equal(game.state.upgradeTarget, null); assert.equal(game.chooseUpgradeTarget(cue.id), false);
    assert.equal(game.state.balls[0].enchantments.stationary_turret, undefined);
  }
});

test('turret conversion has no implicit cue fallback and TNT retains only redstone detonation semantics', () => {
  const { game, s, cue } = setup(); const tnt = add(game, 'tnt');
  assert.equal(game._applyUpgrade('stationary_turret'), false); assert.equal(cue.enchantments.stationary_turret, undefined);
  s.stations.anvil = true; s.books.stationary_turret = 1; s.xp = 20;
  assert.equal(game.enchant({ kind: 'ball', id: tnt.id }, 'book', 'stationary_turret'), false);
  assert.equal(s.books.stationary_turret, 1); assert.equal(s.xp, 20);
  assert.equal(game.describeEnchantTarget({ kind: 'ball', id: tnt.id }).pool.includes('stationary_turret'), false);
  assert.equal(game.shoot(0, 1, tnt.id), true); assert.equal(s.beams.length, 0); assert.ok(tnt.vx > 0);
});
