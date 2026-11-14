import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core.js';

const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} should equal ${b}`);
function setup() {
  const events = [];
  const g = new Game({ random: () => 0.99, onEvent: event => events.push(event) });
  g.start(); g._spawnTimer = g._treeTimer = g._oreTimer = Infinity;
  g.state.resources = []; g.state.hp = g.state.maxHp = 100000;
  Object.assign(g.state.balls[0], { x: 100, y: 150 });
  return { g, events, ball: g.state.balls[0] };
}
function book(g, target, id, count = 1) {
  g.state.stations.anvil = true; g.state.xp += count * 3;
  g.state.books[id] = (g.state.books[id] || 0) + count;
  for (let i = 0; i < count; i++) assert.equal(g.enchant(target, 'book', id), true, `apply ${id} book`);
}
function turret(g, ball) { book(g, { kind: 'ball', id: ball.id }, 'stationary_turret'); }
function charge(g, ball) { assert.equal(g.beginAim(ball.id), true); g.advanceAim(0.9); assert.equal(g.getAimInfo().ready, true); }
function fire(g, ball, angle = 0) { charge(g, ball); assert.equal(g.shoot(angle, 1, ball.id), true); }
function enemy(g, kind = 'zombie', options = {}) {
  return g._spawnEnemy(kind, { x: 300, y: 150, hp: 10000, maxHp: 10000, speed: 0, attackCooldown: 999, ...options });
}

test('a legally enchanted turret is immovable while another physical block rebounds off it', () => {
  const { g, ball } = setup(); turret(g, ball);
  Object.assign(ball, { x: 300, y: 150 });
  const incoming = g._newBall('iron', 245, 150); incoming.vx = 600; g.state.balls.push(incoming);
  g.update(0.12);
  assert.equal(ball.x, 300); assert.equal(ball.y, 150); assert.equal(ball.vx, 0); assert.equal(ball.vy, 0);
  assert.ok(incoming.vx < 0, 'the mobile block should rebound instead of moving the anchor');
  assert.equal(g._isTurret(incoming), false, 'temporary sharing must not turn the incoming block into a turret');
  assert.equal(incoming.enchantments.stationary_turret, undefined);
});

test('a turret cannot fire before charging, stays anchored after firing, and advances slow world time', () => {
  const { g, ball, events } = setup(); turret(g, ball);
  assert.equal(g.shoot(0, 1, ball.id), false);
  assert.equal(g.beginAim(ball.id), true); g.advanceAim(0.2);
  assert.equal(g.shoot(0, 1, ball.id), false);
  g.advanceAim(0.7);
  close(g.state.elapsed, 0.27);
  assert.equal(g.shoot(0, 1, ball.id), true);
  assert.equal(ball.x, 100); assert.equal(ball.y, 150); assert.equal(ball.vx, 0); assert.equal(ball.vy, 0);
  assert.ok(events.some(event => event.type === 'beam'));
});

test('beam XP collection, mining and crystal damage preserve reflection occlusion and single rewards', () => {
  const { g, ball, events } = setup(); turret(g, ball);
  const tree = g._spawnResource('tree', 350, 150); tree.hp = 1;
  const crystal = { id: 80001, x: 550, y: 150, r: 24, hp: 100, maxHp: 100, shield: 80, maxShield: 80 };
  g.state.crystals.push(crystal); g._dropExperience(220, 150, 2);
  const wood = g.state.materials.wood, xp = g.state.totalXp;
  fire(g, ball);
  assert.equal(g.state.totalXp - xp, 2); assert.equal(g.state.experienceOrbs.length, 0);
  assert.equal(tree.hp, 0); assert.equal(g.state.materials.wood - wood, 3);
  assert.equal(crystal.shield, 80, 'the first ray reflects at the tree, even if that hit destroys it');
  fire(g, ball);
  assert.equal(crystal.shield, 40); assert.equal(crystal.hp, 100);
  assert.equal(g.state.materials.wood - wood, 3, 'dead resources never pay again');
  assert.equal(events.filter(event => event.type === 'hit' && event.target === 'resource' && event.broken).length, 1);
});

test('endermen dodge one beam and remain hittable while their teleport cooldown is active', () => {
  const { g, ball, events } = setup(); turret(g, ball);
  const target = enemy(g, 'enderman', { grabCooldown: 999 });
  fire(g, ball);
  assert.equal(target.hp, target.maxHp); assert.equal(events.filter(event => event.type === 'teleport').length, 1);
  assert.ok(target.teleportCooldown > 0);
  fire(g, ball, Math.atan2(target.y - ball.y, target.x - ball.x));
  assert.ok(target.hp < target.maxHp);
  assert.equal(events.filter(event => event.type === 'teleport').length, 1);
});

test('primary and echo beams apply power once and cap repeated target hits per volley', () => {
  const { g, ball, events } = setup(); turret(g, ball);
  book(g, { kind: 'ball', id: ball.id }, 'power', 2);
  book(g, { kind: 'ball', id: ball.id }, 'prism', 2);
  book(g, { kind: 'rod', id: 'wood' }, 'echo', 2);
  charge(g, ball);
  const target = enemy(g, 'zombie', { x: 250, r: 100 });
  assert.equal(g.shoot(0, 1, ball.id), true);
  close(target.maxHp - target.hp, 40 * 1.48 * (1 + 0.7 + 0.7));
  assert.equal(events.filter(event => event.type === 'hit' && event.damageSource === 'beam').length, 3);
  assert.equal(events.filter(event => event.type === 'beam').length, 7);
  assert.ok(g.state.beams.length <= 9);
});

test('beam lightning carries fire and frost to off-axis targets without multiplying power again', () => {
  const { g, ball, events } = setup(); turret(g, ball);
  book(g, { kind: 'ball', id: ball.id }, 'power', 2);
  book(g, { kind: 'ball', id: ball.id }, 'fire_aspect');
  book(g, { kind: 'ball', id: ball.id }, 'frost_touch');
  ball.traits = ['storm']; g._flameCooldown = 100;
  charge(g, ball);
  const direct = enemy(g), secondary = enemy(g, 'zombie', { x: 350, y: 190 });
  assert.equal(g.shoot(0, 1, ball.id), true);
  const expected = 40 * 1.48 * 0.45;
  close(secondary.maxHp - secondary.hp, expected);
  assert.ok(secondary.burnTimer > 0); assert.ok(secondary.frostTimer > 0);
  assert.equal(secondary.frostStacks, 1); assert.equal(direct.frostStacks, 1);
  assert.ok(events.filter(event => event.type === 'lightning').every(event => Math.abs(event.value - expected) < 1e-6));
});

test('three frost hits shatter once while keeping burning and slow active', () => {
  const { g, ball, events } = setup();
  book(g, { kind: 'ball', id: ball.id }, 'fire_aspect');
  book(g, { kind: 'ball', id: ball.id }, 'frost_touch');
  const target = enemy(g); g._flameCooldown = 100;
  for (let i = 0; i < 3; i++) g._damage(target, 10, '#fff', ball);
  assert.equal(events.filter(event => event.type === 'buildEffect' && event.effect === 'frostBurst').length, 1);
  assert.equal(target.frostStacks, 0); assert.ok(target.burnTimer > 0); assert.ok(target.slowTimer > 0);
  g._damage(target, 10, '#fff', ball);
  assert.equal(target.frostStacks, 1, 'the shatter cascade must not add another layer in its own hit context');
});

test('burn damage and timers use simulated slow time and stop during pause and transition', () => {
  const { g, ball } = setup();
  book(g, { kind: 'ball', id: ball.id }, 'fire_aspect');
  const target = enemy(g); g._flameCooldown = 100; g._damage(target, 10, '#fff', ball);
  const startHp = target.hp, timer = target.burnTimer, dps = target.burnDps;
  assert.equal(g.beginAim(ball.id), true); g.advanceAim(1);
  close(target.burnTimer, timer - 0.3); assert.equal(target.hp, startHp);
  g.advanceAim(1);
  close(startHp - target.hp, dps * 0.5); close(target.burnTimer, timer - 0.6);
  g.togglePause(); const pausedHp = target.hp, pausedTimer = target.burnTimer; g.update(1);
  assert.equal(target.hp, pausedHp); assert.equal(target.burnTimer, pausedTimer);
  g.state.phase = 'transition'; g.state.transition = { to: 'nether', elapsed: 0, duration: 2.5 }; g.update(1);
  assert.equal(target.hp, pausedHp); assert.equal(target.burnTimer, pausedTimer);
});

test('prism ghosts inherit separate element and enchantment snapshots without retaining turret mode', () => {
  const { g, ball } = setup();
  book(g, { kind: 'ball', id: ball.id }, 'prism');
  book(g, { kind: 'ball', id: ball.id }, 'fire_aspect');
  book(g, { kind: 'ball', id: ball.id }, 'frost_touch');
  ball.traits = ['storm', 'frost'];
  assert.equal(g.shoot(0, 1, ball.id), true);
  const ghosts = g.state.balls.filter(candidate => candidate.type === 'ghost'); assert.equal(ghosts.length, 2);
  ball.enchantments.fire_aspect = 0; ball.traits.length = 0;
  for (const ghost of ghosts) {
    assert.equal(ghost.enchantments.fire_aspect, 1); assert.equal(ghost.enchantments.frost_touch, 1);
    assert.deepEqual(ghost.traits, ['storm', 'frost']); assert.equal(g._isTurret(ghost), false);
    assert.ok(ghost.fireTimer > 0);
  }
  g._flameCooldown = 100;
  const target = enemy(g); g._damage(target, 10, '#fff', ghosts[0]);
  assert.ok(target.burnTimer > 0); assert.ok(target.frostTimer > 0);
  assert.equal(target.frostStacks, 1);
});

test('delayed gravity collapse retains borrowed storm and frost after the original chain is cleared', () => {
  const { g, ball, events } = setup();
  book(g, { kind: 'ball', id: ball.id }, 'gravity_mark');
  for (const type of ['storm', 'frost']) {
    const donor = g._newBall(type, 150 + ball.r + 12 - 1, 150); g.state.balls.push(donor);
    g.state.elapsed += 0.2; Object.assign(ball, { x: 150, y: 150, vx: 700, vy: 0 });
    Object.assign(donor, { x: 150 + ball.r + donor.r - 1, y: 150, vx: 0, vy: 0 });
    g._ballPair(ball, donor);
  }
  assert.ok(g._combatTraits(ball).includes('storm')); assert.ok(g._combatTraits(ball).includes('frost'));
  const marked = enemy(g); g._damage(marked, 20, '#fff', ball);
  assert.ok(marked.gravityTimer > 0);
  const snapshot = marked.gravitySource;
  g._clearRicochet(ball); g.state.balls = [ball]; ball.vx = ball.vy = 0;
  assert.equal(g._combatTraits(ball).includes('storm'), false);
  assert.ok(g._combatTraits(snapshot).includes('storm')); assert.ok(g._combatTraits(snapshot).includes('frost'));
  const next = enemy(g, 'zombie', { x: 350, y: 190 }); g.state.elapsed += 1; events.length = 0;
  g._damage(marked, 20000, '#fff');
  assert.ok(events.some(event => event.type === 'buildEffect' && event.effect === 'gravityCollapse'));
  assert.ok(events.some(event => event.type === 'lightning'));
  assert.ok(next.frostTimer > 0); assert.ok(next.hp < next.maxHp);
});

test('a dense lethal elemental cascade remains bounded and pays each enemy drop once', () => {
  const { g, ball, events } = setup();
  ball.traits = ['storm', 'frost']; ball.enchantments = { fire_aspect: 3, frost_touch: 3, gravity_mark: 3, earthshatter: 3 }; ball.fireTimer = 5;
  const targets = [];
  for (let i = 0; i < 120; i++) targets.push(enemy(g, 'skeleton', { x: 270 + i % 12 * 8, y: 135 + Math.floor(i / 12) * 8, hp: 1, maxHp: 1 }));
  const beforeBones = g.state.materials.bone;
  assert.doesNotThrow(() => g._damage(targets[0], 100, '#fff', ball));
  const kills = targets.filter(target => target.hp === 0).length;
  assert.equal(g.state.kills, kills); assert.ok(kills > 1 && kills <= 120);
  assert.equal(g.state.materials.bone - beforeBones, kills * 2);
  assert.equal(events.filter(event => event.type === 'kill').length, kills);
  assert.ok(events.length < 3000, 'secondary effect depth and contexts must bound a crowded cascade');
  for (const target of targets) assert.ok(Number.isFinite(target.hp));
  for (const target of targets.filter(target => target.hp === 0)) g._damage(target, 100, '#fff', ball);
  assert.equal(g.state.kills, kills); assert.equal(g.state.materials.bone - beforeBones, kills * 2);
});

test('expired ghost build cooldown entries are reclaimed within a stage and reset on travel', () => {
  const { g } = setup(), target = enemy(g, 'zombie', { hp: 1e8, maxHp: 1e8 });
  for (let i = 0; i < 220; i++) {
    const ghost = g._newBall('ghost', 100, 150); ghost.enchantments.earthshatter = 1;
    g._damage(target, 0.1, '#fff', ghost); g.state.elapsed += 0.7;
  }
  assert.ok(g._buildCooldowns.size > 0);
  g.update(6);
  assert.ok(g._buildCooldowns.size < 100, 'old short-lived ghost ids must not accumulate forever');
  g._changeStage('nether'); assert.equal(g._buildCooldowns.size, 0);
});

test('nine elemental beams against 120 late-wave targets retain bounded work and permanent equipment', () => {
  const { g, ball, events } = setup();
  ball.enchantments = { stationary_turret: 1, prism: 3, fire_aspect: 3, frost_touch: 3 };
  ball.traits = ['storm', 'frost', 'iron'];
  g.state.rodEnchantments.wood = { echo: 2, earthshatter: 3, gravity_mark: 3, power: 3 };
  const equipment = structuredClone({ enchantments: ball.enchantments, traits: ball.traits, rod: g.state.rodEnchantments.wood });
  Object.assign(ball, { x: 100, y: 100 }); charge(g, ball);
  g.state.stageWave = 30;
  for (let i = 0; i < 120; i++) enemy(g, 'zombie', { x: 200 + i % 12 * 45, y: 80 + Math.floor(i / 12) * 45, hp: 1e6, maxHp: 1e6 });
  events.length = 0;
  assert.equal(g.shoot(0.35, 1, ball.id), true);
  assert.equal(g.state.beams.length, 9);
  assert.ok(g.state.beams.every(beam => beam.segments.length <= 4));
  const primary = events.filter(event => event.type === 'hit' && event.damageSource === 'beam');
  assert.ok(primary.length > 10 && primary.length <= 120 * 3);
  assert.ok(events.length < 5000, 'per-ray contexts and volley caps must bound secondary event work');
  assert.equal(g.state.kills, 0);
  for (const target of g.state.enemies) assert.ok(Number.isFinite(target.hp) && target.hp > 0 && target.hp <= target.maxHp);
  assert.deepEqual({ enchantments: ball.enchantments, traits: ball.traits, rod: g.state.rodEnchantments.wood }, equipment);
});
