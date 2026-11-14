import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD, UPGRADES } from '../src/core.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} should equal ${expected}`);
function setup() {
  const g = new Game({ random: () => 0.99 }); g.start();
  g._spawnTimer = g._treeTimer = g._oreTimer = Infinity;
  g.state.resources = [];
  return { g, cue: g.state.balls[0] };
}
function add(g, type, options = {}) {
  const ball = g._newBall(type, 800, 600); Object.assign(ball, options); g._refreshBall(ball); g.state.balls.push(ball); return ball;
}
function book(g, ball, id, count = 1) {
  g.state.stations.anvil = true; g.state.xp += count * 3; g.state.books[id] = count;
  for (let i = 0; i < count; i++) assert.equal(g.enchant({ kind: 'ball', id: ball.id }, 'book', id), true);
}
function offer(g, count = 1) {
  const candidates = UPGRADES.filter(upgrade => !upgrade.fallbackOnly && upgrade.category === 'ball' && g._isFreeUpgradeAvailable(upgrade.id));
  const index = candidates.findIndex(upgrade => upgrade.id === 'stationary_turret'); assert.ok(index >= 0, 'some legal block must make the turret offer available');
  const sample = (index + 0.5) / candidates.length;
  g.random = () => sample; g.state.pendingUpgrades = count;
  assert.equal(g._checkLevel(), true); assert.ok(g.state.choices.includes('stationary_turret'));
}
function wall(g, ball, speed = 900) {
  Object.assign(ball, { x: WORLD.margin + ball.r - 1, y: 130, vx: -speed, vy: 0 });
  g._ballWalls(ball); return Math.hypot(ball.vx, ball.vy);
}

test('slime crafting spends real materials and produces the persistent high-bounce trait', () => {
  const { g } = setup(); g._grantMaterials({ slimeBall: 3, stone: 2 }, 500, 360);
  const before = { slimeBall: g.state.materials.slimeBall, stone: g.state.materials.stone };
  assert.equal(g.canCraft('slime_block').ok, true); assert.equal(g.craft('slime_block'), true);
  const slime = g.state.balls.find(ball => ball.type === 'slime'); assert.ok(slime);
  assert.ok(slime.traits.includes('slime'));
  assert.equal(before.slimeBall - g.state.materials.slimeBall, 3);
  assert.equal(before.stone - g.state.materials.stone, 2);
});

test('slime retains more wall speed yet maximum elasticity still respects the cap and eventually stops', () => {
  const plain = setup(), elastic = setup(); const slime = add(elastic.g, 'slime');
  const normalSpeed = wall(plain.g, plain.cue), slimeSpeed = wall(elastic.g, slime);
  assert.ok(slimeSpeed > normalSpeed);
  book(elastic.g, slime, 'elasticity', 4);
  Object.assign(slime, { x: 100, y: 120, vx: 100000, vy: 50000 });
  for (let i = 0; i < 1000; i++) {
    elastic.g.update(0.02);
    assert.ok(Math.hypot(slime.vx, slime.vy) <= 1250 + 1e-6);
  }
  assert.equal(slime.vx, 0); assert.equal(slime.vy, 0);
  assert.equal(slime.ricochet, null);
});

test('fusion preserves slime elasticity and inherited ghosts receive independent slime traits', () => {
  const { g, cue } = setup(), slime = add(g, 'slime'); g.state.stations.anvil = true;
  assert.equal(g.fuseBlocks(cue.id, slime.id), true);
  assert.ok(cue.traits.includes('slime')); assert.equal(g.state.balls.some(ball => ball.id === slime.id), false);
  g.state.rodEnchantments.wood.echo = 1;
  assert.equal(g.shoot(0, 1, cue.id), true);
  const ghost = g.state.balls.find(ball => ball.type === 'ghost'); assert.ok(ghost);
  assert.ok(ghost.traits.includes('slime'));
  const ghostSpeed = wall(g, ghost);
  const normal = setup(); const normalSpeed = wall(normal.g, normal.cue);
  assert.ok(ghostSpeed > normalSpeed);
  cue.traits.length = 0;
  assert.ok(ghost.traits.includes('slime'), 'a ghost owns its inherited trait array');
});

test('temporary slime sharing boosts reflection only for the moving chain and cannot pollute permanent traits', () => {
  const { g, cue } = setup(), slime = add(g, 'slime');
  Object.assign(cue, { x: 150, y: 150, vx: 700, vy: 0 });
  Object.assign(slime, { x: 150 + cue.r + slime.r - 1, y: 150, vx: 0, vy: 0 });
  g._ballPair(cue, slime);
  assert.ok(g._combatTraits(cue).includes('slime')); assert.equal(cue.traits.includes('slime'), false);
  const sharedSpeed = wall(g, cue);
  Object.assign(cue, { x: 300, y: 130, vx: 0, vy: 0 }); Object.assign(slime, { x: 850, y: 600, vx: 0, vy: 0 });
  g.update(0.02);
  assert.equal(g._combatTraits(cue).includes('slime'), false);
  assert.equal(cue.traits.includes('slime'), false); assert.ok(slime.traits.includes('slime'));
  const normalSpeed = wall(g, cue);
  assert.ok(sharedSpeed > normalSpeed);
});

test('choosing turret opens a target step and cancellation preserves pending upgrades, cards and random state', () => {
  const { g, cue } = setup(); add(g, 'slime'); offer(g, 2);
  const choices = [...g.state.choices], offered = [...g._offeredUpgrades], equipment = structuredClone(cue.enchantments);
  let randomCalls = 0; const random = g.random; g.random = () => { randomCalls++; return random(); };
  assert.equal(g.chooseUpgrade('stationary_turret'), true);
  assert.equal(g.state.upgradeTarget, 'stationary_turret'); assert.equal(g.state.pendingUpgrades, 2);
  assert.deepEqual(cue.enchantments, equipment);
  assert.equal(g.cancelUpgradeTarget(), true);
  assert.equal(g.state.upgradeTarget, null); assert.equal(g.state.pendingUpgrades, 2);
  assert.deepEqual(g.state.choices, choices); assert.deepEqual(g._offeredUpgrades, offered);
  assert.equal(randomCalls, 0, 'opening and cancelling must not reroll rewards');
});

test('confirming a non-cue block changes only that target and settles exactly one queued upgrade', () => {
  const { g, cue } = setup(), slime = add(g, 'slime'), iron = add(g, 'iron'); offer(g, 2);
  const otherBags = [structuredClone(cue.enchantments), structuredClone(iron.enchantments)];
  assert.equal(g.chooseUpgrade('stationary_turret'), true);
  assert.equal(g.chooseUpgradeTarget(slime.id), true);
  assert.equal(slime.enchantments.stationary_turret, 1);
  assert.deepEqual(cue.enchantments, otherBags[0]); assert.deepEqual(iron.enchantments, otherBags[1]);
  assert.equal(g.state.pendingUpgrades, 1); assert.equal(g.state.phase, 'upgrade'); assert.equal(g.state.upgradeTarget, null);
  assert.equal(g.chooseUpgradeTarget(slime.id), false, 'a stale double click must not consume the next upgrade');
  assert.equal(g.state.pendingUpgrades, 1); assert.equal(slime.enchantments.stationary_turret, 1);
  assert.equal(g.chooseUpgrade('stationary_turret'), true); assert.equal(g.chooseUpgradeTarget(iron.id), true);
  assert.equal(iron.enchantments.stationary_turret, 1); assert.equal(g.state.pendingUpgrades, 0); assert.equal(g.state.phase, 'playing');
});

test('an unavailable cue does not suppress a turret offer when another block is legal', () => {
  for (const reason of ['held', 'full', 'maximum']) {
    const { g, cue } = setup(), legal = add(g, 'slime');
    if (reason === 'held') cue.heldBy = 999;
    if (reason === 'full') cue.enchantments = { power: 1, crit: 1, fire_aspect: 1, frost_touch: 1 };
    if (reason === 'maximum') cue.enchantments = { stationary_turret: 3 };
    offer(g); assert.equal(g.chooseUpgrade('stationary_turret'), true);
    assert.equal(g.canChooseUpgradeTarget(cue.id).ok, false);
    assert.equal(g.canChooseUpgradeTarget(legal.id).ok, true);
    assert.equal(g.chooseUpgradeTarget(legal.id), true);
    assert.equal(legal.enchantments.stationary_turret, 1);
  }
});

test('TNT, ghosts, held, expired, full-slot and maximum-level blocks are rejected without consuming choices', () => {
  const { g } = setup(); const legal = add(g, 'slime');
  const invalid = [
    add(g, 'tnt'), add(g, 'ghost', { life: 2 }), add(g, 'iron', { heldBy: 999 }), add(g, 'iron', { detonated: true }),
    add(g, 'iron', { life: 0 }), add(g, 'iron', { enchantments: { power: 1, crit: 1, fire_aspect: 1, frost_touch: 1 } }),
    add(g, 'iron', { enchantments: { stationary_turret: 3 } }),
  ];
  offer(g); assert.equal(g.chooseUpgrade('stationary_turret'), true);
  for (const target of invalid) {
    const check = g.canChooseUpgradeTarget(target.id); assert.equal(check.ok, false); assert.ok(check.reason);
    assert.equal(g.chooseUpgradeTarget(target.id), false);
    assert.equal(g.state.pendingUpgrades, 1); assert.equal(g.state.upgradeTarget, 'stationary_turret');
  }
  assert.equal(g.chooseUpgradeTarget(999999), false);
  assert.equal(g.chooseUpgradeTarget(legal.id), true);
});

test('target confirmation revalidates availability and existing turret ranks can upgrade in a full bag', () => {
  const { g } = setup(), target = add(g, 'slime'); offer(g); g.chooseUpgrade('stationary_turret');
  assert.equal(g.canChooseUpgradeTarget(target.id).ok, true);
  target.heldBy = 999; assert.equal(g.chooseUpgradeTarget(target.id), false);
  delete target.heldBy;
  target.enchantments = { stationary_turret: 1, power: 1, crit: 1, frost_touch: 1 };
  assert.equal(g.chooseUpgradeTarget(target.id), true);
  assert.equal(target.enchantments.stationary_turret, 2); assert.equal(Object.keys(target.enchantments).length, 4);
});

test('slime blocks reflect turret beams, shield targets behind them and keep turret ownership local', () => {
  const { g, cue } = setup(), slime = add(g, 'slime');
  book(g, cue, 'stationary_turret'); Object.assign(cue, { x: 200, y: 150 }); Object.assign(slime, { x: 400, y: 150 });
  assert.equal(g.beginAim(cue.id), true); g.advanceAim(0.9);
  const front = g._spawnEnemy('zombie', { x: 300, y: 150, speed: 0, hp: 1000, maxHp: 1000 });
  const behind = g._spawnEnemy('zombie', { x: 600, y: 150, speed: 0, hp: 1000, maxHp: 1000 });
  assert.equal(g.shoot(0, 1, cue.id), true);
  assert.ok(front.hp < 1000); assert.equal(behind.hp, 1000);
  const beam = g.state.beams[0]; assert.ok(beam.segments.length >= 2); assert.ok(beam.segments[1].to.x < beam.segments[1].from.x);
  assert.equal(g._isTurret(slime), false); assert.equal(slime.enchantments.stationary_turret, undefined);
});

test('reset and finished runs clear an open turret target transaction', () => {
  const { g } = setup(); offer(g); g.chooseUpgrade('stationary_turret');
  g.reset(); assert.equal(g.state.upgradeTarget, null); assert.equal(g.chooseUpgradeTarget(g.state.balls[0].id), false);
  g.start(); offer(g); g.chooseUpgrade('stationary_turret'); g._end('lost');
  assert.equal(g.state.upgradeTarget, null); assert.equal(g.state.pendingUpgrades, 0);
  assert.equal(g.chooseUpgradeTarget(g.state.balls[0].id), false);
});

test('a fused slime turret extends actual beam range and uses the same enhanced plan for preview and firing', () => {
  function trial(fused) {
    const { g, cue } = setup(); g.state.stations.anvil = true;
    if (fused) { const slime = add(g, 'slime'); assert.equal(g.fuseBlocks(cue.id, slime.id), true); }
    book(g, cue, 'stationary_turret');
    const preview = g.previewBeam(0, cue.id), plan = g._beamPlans(cue, 0)[0];
    assert.equal(g.beginAim(cue.id), true); g.advanceAim(0.9); assert.equal(g.shoot(0, 1, cue.id), true);
    const fired = g.state.beams[0];
    assert.deepEqual(fired.segments, preview.segments);
    const distance = fired.segments.reduce((sum, segment) => sum + Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y), 0);
    close(distance, plan.range);
    return { distance, bounces: plan.maxBounces };
  }
  const plain = trial(false), slime = trial(true);
  close(slime.distance / plain.distance, 1.2);
  assert.equal(slime.bounces, plain.bounces + 2);
});
