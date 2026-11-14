import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD, UPGRADES } from '../src/core.js';

function setup() {
  const events = [];
  const game = new Game({ random: () => 0.55, onEvent: event => events.push(event) }); game.start();
  game._spawnTimer = game._treeTimer = game._oreTimer = Infinity;
  game.state.resources = [];
  const ball = game.state.balls[0]; Object.assign(ball, { x: 130, y: 180, vx: 0, vy: 0 });
  return { game, s: game.state, ball, events };
}
function mob(game, x = 300, y = 180, extra = {}) {
  return game._spawnEnemy('zombie', { x, y, hp: 10000, maxHp: 10000, speed: 0, attackCooldown: 1000, ...extra });
}
function turret(ball, extras = {}) { ball.enchantments = { stationary_turret: 1, ...extras }; }
function fire(game, ball, angle = 0) {
  assert.equal(game.beginAim(ball.id), true);
  game.advanceAim(game.getAimInfo().chargeRequired + 0.01);
  assert.equal(game.shoot(angle, 1, ball.id), true);
}

test('new build metadata is available to equipment, books and free choices while turret is block-only', () => {
  const { game, s, ball } = setup();
  s.stations.anvil = true; s.xp = 100;
  for (const id of ['fire_aspect', 'frost_touch', 'stationary_turret', 'earthshatter', 'prism', 'gravity_mark']) {
    assert.ok(UPGRADES.find(upgrade => upgrade.id === id));
    assert.equal(game._isFreeUpgradeAvailable(id), true);
  }
  s.books.stationary_turret = 1;
  assert.equal(game.canEnchant({ kind: 'rod', id: 'wood' }, 'book', 'stationary_turret').ok, false);
  assert.equal(game.enchant({ kind: 'ball', id: ball.id }, 'book', 'stationary_turret'), true);
  assert.equal(game.getBuildInfo(ball.id).mode, 'beam');
  assert.equal(ball.turretActive, true);
  const other = game._newBall('iron', 700, 600); s.balls.push(other);
  assert.equal(game.getBuildInfo(other.id).mode, 'ball');
  game._applyUpgrade('stationary_turret', ball.id);
  assert.equal(ball.enchantments.stationary_turret, 2);
  assert.equal(other.enchantments.stationary_turret, undefined);
  assert.equal(s.upgrades.stationary_turret, undefined);
});

test('fire aspect burns over time and spreads to nearby enemies without clearing ice or producing recursive attack events', () => {
  const { game, s, ball, events } = setup();
  ball.enchantments.fire_aspect = 1;
  const first = mob(game), near = mob(game, 340, 180), far = mob(game, 550, 180);
  first.frostStacks = 2; first.frostTimer = 5; first.slowTimer = 5;
  game._damage(first, 10, '#fff', ball);
  assert.ok(first.burnTimer > 0); assert.equal(first.frostStacks, 2);
  const hp = first.hp; game.update(1.05);
  assert.ok(first.hp < hp); assert.ok(near.burnTimer > 0); assert.equal(far.burnTimer || 0, 0);
  assert.ok(first.frostStacks > 0 && first.slowTimer > 0);
  assert.ok(events.some(event => event.type === 'buildEffect' && event.effect === 'fireSpread'));
  assert.ok(events.filter(event => event.damageSource === 'burn_dot').length < 10);
  const timer = first.burnTimer, currentHp = first.hp; game.togglePause(); game.update(10);
  assert.equal(first.burnTimer, timer); assert.equal(first.hp, currentHp);
  assert.equal(s.combo, 0, 'DOT is not a fresh hit combo');
});

test('rain scales only the fire damage tick and does not remove frost stacks', () => {
  function tick(weather) {
    const { game, s, ball } = setup(); s.weather = weather; ball.enchantments.fire_aspect = 1;
    const target = mob(game); target.frostStacks = 1; target.frostTimer = 5;
    game._damage(target, 10, '#fff', ball); const hp = target.hp;
    game.update(0.51); return { damage: hp - target.hp, frost: target.frostStacks };
  }
  const sun = tick('sunny'), rain = tick('rain');
  assert.ok(Math.abs(rain.damage / sun.damage - 0.6) < 1e-8);
  assert.equal(rain.frost, 1);
});

test('three distinct frost hits progress through slow and frostbite into a stronger shatter', () => {
  const { game, ball, events } = setup(); ball.enchantments.frost_touch = 1;
  const target = mob(game); let hp = target.hp;
  game._damage(target, 10, '#fff', ball); assert.equal(target.frostStacks, 1); const first = hp - target.hp;
  hp = target.hp; game._damage(target, 10, '#fff', ball); assert.equal(target.frostStacks, 2); assert.equal(hp - target.hp, first);
  hp = target.hp; game._damage(target, 10, '#fff', ball); assert.equal(target.frostStacks, 0);
  assert.ok(hp - target.hp > first * 2); assert.ok(target.slowTimer > 0);
  assert.equal(events.filter(event => event.type === 'buildEffect' && event.effect === 'frostBurst').length, 1);
});

test('one fire-lightning-quake cascade contributes one frost stack but independent ghosts can advance it', () => {
  const { game, ball } = setup();
  ball.traits = ['storm', 'frost']; ball.enchantments = { fire_aspect: 1, earthshatter: 1 };
  const target = mob(game);
  game._damage(target, 10, '#fff', ball);
  assert.equal(target.frostStacks, 1);
  const ghost = game._newBall('ghost', 200, 180); ghost.life = 2; ghost.traits = ['frost'];
  game._damage(target, 10, '#fff', ghost);
  assert.equal(target.frostStacks, 2);
});

test('earthshatter adds a mild independent slow and its secondary hits carry fire and frost', () => {
  const { game, ball, events } = setup();
  ball.enchantments = { earthshatter: 1, fire_aspect: 1, frost_touch: 1 };
  const center = mob(game), near = mob(game, 350, 180), far = mob(game, 550, 180);
  game._damage(center, 10, '#fff', ball);
  assert.ok(near.hp < near.maxHp); assert.ok(near.quakeSlowTimer > 0);
  assert.ok(near.burnTimer > 0); assert.equal(near.frostStacks, 1);
  assert.equal(far.hp, far.maxHp);
  assert.equal(events.filter(event => event.type === 'buildEffect' && event.effect === 'quake').length, 1);
  const mild = setup(); mild.ball.enchantments.earthshatter = 1;
  const onlyQuake = mob(mild.game); mild.game._damage(onlyQuake, 10, '#fff', mild.ball);
  assert.ok(onlyQuake.quakeSlowTimer > 0); assert.equal(onlyQuake.slowTimer || 0, 0);
});

test('gravity attracts nearby enemies and death collapse inherits status effects without duplicate kill rewards', () => {
  const { game, s, ball, events } = setup();
  ball.enchantments = { gravity_mark: 1, fire_aspect: 1, frost_touch: 1 };
  const marked = mob(game, 300, 180), nearby = mob(game, 360, 180);
  game._damage(marked, 10, '#fff', ball); game.update(0.13);
  assert.ok(nearby.vx < 0, 'nearby enemies accelerate toward the mark');
  const hp = nearby.hp;
  game._damage(marked, 20000, '#fff', ball);
  assert.ok(nearby.hp < hp); assert.ok(nearby.burnTimer > 0); assert.ok(nearby.frostTimer > 0);
  const kills = s.kills, orbs = s.experienceOrbs.reduce((sum, orb) => sum + orb.value, 0);
  game._damage(marked, 20000, '#fff', ball);
  assert.equal(s.kills, kills); assert.equal(s.experienceOrbs.reduce((sum, orb) => sum + orb.value, 0), orbs);
  assert.equal(events.filter(event => event.type === 'buildEffect' && event.effect === 'gravityCollapse' && event.x === marked.x).length, 1);
});

test('turrets charge in real time, reject premature fire and remain fixed through firing and physical collisions', () => {
  const { game, s, ball } = setup(); turret(ball);
  const target = mob(game); const origin = { x: ball.x, y: ball.y };
  assert.equal(game.shoot(0, 1, ball.id), false);
  game.beginAim(ball.id); assert.equal(game.getAimInfo().mode, 'beam'); assert.equal(game.getAimInfo().ready, false);
  game.advanceAim(0.3); assert.equal(game.shoot(0, 1, ball.id), false);
  assert.ok(game.getAimInfo().chargeProgress > 0);
  game.advanceAim(0.55); assert.equal(game.getAimInfo().ready, true);
  assert.equal(game.shoot(0, 1, ball.id), true);
  assert.equal(ball.vx, 0); assert.equal(ball.vy, 0); assert.deepEqual({ x: ball.x, y: ball.y }, origin);
  assert.ok(target.hp < target.maxHp); assert.ok(s.beams.length > 0);
  const other = game._newBall('iron', ball.x + 20, ball.y); other.vx = -600; s.balls.push(other);
  game._ballPair(ball, other); assert.deepEqual({ x: ball.x, y: ball.y }, origin);
  assert.equal(ball.vx, 0); assert.ok(other.vx > 0);
});

test('beam preview shares real reflection geometry and cannot mutate simulation or harvest targets', () => {
  const { game, s, ball } = setup(); turret(ball);
  const resource = game._spawnResource('ore', 300, 180, 'iron');
  const before = structuredClone(s), preview = game.previewBeam(0, ball.id);
  assert.ok(preview.segments.length > 1);
  assert.deepEqual(s, before);
  fire(game, ball);
  assert.deepEqual(s.beams[0].segments, preview.segments);
  assert.ok(resource.hp < resource.maxHp);
});

test('beam weapons can collect distant XP and break crystals while higher pickaxes still control mining strength', () => {
  const { game, s, ball } = setup(); turret(ball);
  game._dropExperience(210, 180, 2);
  s.crystals.push({ id: 900, x: 300, y: 180, r: 24, hp: 100, maxHp: 100, shield: 80, maxShield: 80 });
  fire(game, ball);
  assert.equal(s.xp, 2); assert.equal(s.experienceOrbs.length, 0);
  assert.ok(s.crystals[0].shield < 80);
  function mine(pickaxe) {
    const trial = setup(); turret(trial.ball); trial.s.pickaxe = pickaxe;
    const ore = trial.game._spawnResource('ore', 300, 180, 'obsidian'); fire(trial.game, trial.ball);
    return ore.maxHp - ore.hp;
  }
  assert.ok(mine('diamond') > mine('hand') * 10);
});

test('prism and echo make bounded inherited ghosts for ordinary blocks and bounded multi-beams for turrets', () => {
  const { game, s, ball } = setup(); ball.traits = ['storm', 'frost']; ball.enchantments = { fire_aspect: 1, prism: 2 }; s.upgrades.echo = 2;
  assert.equal(game.shoot(0, 1, ball.id), true);
  const ghosts = s.balls.filter(candidate => candidate.type === 'ghost'); assert.equal(ghosts.length, 6);
  for (const ghost of ghosts) { assert.deepEqual(ghost.traits, ['storm', 'frost']); assert.equal(ghost.enchantments.fire_aspect, 1); assert.ok(ghost.fireTimer > 0); assert.equal(ghost.turretActive, undefined); }
  const beam = setup(); turret(beam.ball, { prism: 3, frost_touch: 1 }); beam.s.upgrades.echo = 3;
  const target = mob(beam.game, 250, 180, { r: 40 }); fire(beam.game, beam.ball);
  assert.ok(beam.s.beams.length > 3 && beam.s.beams.length <= 9);
  assert.ok(beam.events.some(event => event.type === 'buildEffect' && event.effect === 'frostBurst'));
  assert.ok(target.hp < target.maxHp);
});

test('redstone beams trigger lightning and preserve fire/frost status on secondary targets', () => {
  const { game, ball, events } = setup(); turret(ball, { fire_aspect: 1, frost_touch: 1 }); ball.traits = ['storm'];
  mob(game, 300, 180); const secondary = mob(game, 340, 250);
  fire(game, ball);
  assert.ok(events.some(event => event.type === 'lightning'));
  assert.ok(secondary.hp < secondary.maxHp); assert.ok(secondary.burnTimer > 0); assert.ok(secondary.frostTimer > 0);
});

test('turret relocation and enderman beam dodges retain finite cooldowns instead of freezing progression', () => {
  const { game, s, ball, events } = setup(); turret(ball);
  const enderman = game._spawnEnemy('enderman', { x: 300, y: 180, hp: 10000, maxHp: 10000, speed: 0 });
  fire(game, ball); assert.ok(enderman.teleportCooldown > 0);
  assert.equal(events.filter(event => event.type === 'teleport').length, 1);
  const x = enderman.x, y = enderman.y; fire(game, ball, Math.atan2(y - ball.y, x - ball.x));
  assert.ok(enderman.hp < enderman.maxHp); assert.equal(events.filter(event => event.type === 'teleport').length, 1);
  s.items.ender_pearl = 1; assert.equal(game.useItem('ender_pearl', 700, 550, ball.id), true);
  assert.equal(game.getBuildInfo(ball.id).mode, 'beam');
  assert.equal(game.recall(), true); assert.equal(ball.x, 500); assert.equal(ball.y, 460);
  game._changeStage('nether'); assert.equal(game.getBuildInfo(ball.id).mode, 'beam'); assert.equal(s.beams.length, 0);
});

test('dense six-build combinations stay bounded, award one kill per enemy and never create NaN movement', () => {
  const { game, s, ball, events } = setup(); turret(ball, { fire_aspect: 3, frost_touch: 3, gravity_mark: 3 });
  Object.assign(s.upgrades, { earthshatter: 3, prism: 3, echo: 3 }); ball.traits = ['storm', 'frost'];
  for (let i = 0; i < 100; i += 1) mob(game, 250 + (i % 10) * 12, 140 + Math.floor(i / 10) * 12, { hp: 80, maxHp: 80, r: 7 });
  fire(game, ball); game.update(1);
  assert.ok(s.kills <= 100); assert.equal(events.filter(event => event.type === 'kill').length, s.kills);
  assert.ok(events.length < 4000); assert.ok(s.beams.length <= 24); assert.ok(s.balls.length <= 18);
  for (const enemy of s.enemies) { assert.ok(Number.isFinite(enemy.x + enemy.y + enemy.vx + enemy.vy)); assert.ok(enemy.x - enemy.r >= WORLD.margin); assert.ok(enemy.x + enemy.r <= WORLD.width - WORLD.margin); }
});

test('delayed gravity collapse preserves borrowed burning and elemental traits after the source stops', () => {
  const { game, s, ball, events } = setup();
  ball.enchantments = { gravity_mark: 1, steam_burst: 1 };
  const donor = game._newBall('frost', 160, 180); donor.traits = ['storm', 'frost']; donor.fireTimer = 3; s.balls.push(donor);
  Object.assign(ball, { x: 140, y: 180, vx: 500, vy: 0 });
  game._ballPair(ball, donor);
  const marked = mob(game, 330, 180); game._damage(marked, 10, '#fff', ball);
  assert.ok(marked.gravitySource.fireTimer > 0);
  game._clearRicochet(ball); game._clearRicochet(donor); donor.fireTimer = 0;
  const next = mob(game, 375, 180);
  s.elapsed += 2; game._enchantCooldowns.steam = 0;
  const before = events.filter(event => event.type === 'pulse' && event.source === 'steam').length;
  game._damage(marked, 20000, '#fff', null);
  assert.ok(next.burnTimer > 0); assert.ok(next.frostTimer > 0);
  assert.ok(events.filter(event => event.type === 'pulse' && event.source === 'steam').length > before);
  assert.equal(ball.fireTimer || 0, 0, 'delayed snapshots never write borrowed flame into the original block');
});
