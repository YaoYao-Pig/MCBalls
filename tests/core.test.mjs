import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD, UPGRADES, RECIPES, RODS, describeBall, describeCatch, getSpawnProfile } from '../src/core.js';

function game() {
  const g = new Game({ random: () => 0.55 });
  g.start();
  return g;
}

function enemy(id, x, y, options = {}) {
  return { id, kind: 'grunt', x, y, vx: 0, vy: 0, r: 15, hp: 100, maxHp: 100, speed: 0, ...options };
}

function upgrade(g, id) {
  if (id === 'rod') {
    const recipe = RECIPES.find(r => r.kind === 'rod' && r.rodLevel === (g.state.upgrades.rod || 0));
    for (const [key, amount] of Object.entries(recipe.cost)) g.state.materials[key] = Math.max(g.state.materials[key] || 0, amount);
    g.state.phase = 'playing';
    assert.equal(g.craft(recipe.id), true);
    return;
  }
  g._applyUpgrade(id);
}

test('new runs begin with one cue ball and reset to ready', () => {
  const g = game();
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.state.balls.length, 1);
  assert.equal(g.state.balls[0].type, 'cue');
  assert.equal(g.state.balls[0].x, 500);
  assert.equal(g.state.balls[0].y, 460);
  g.reset();
  assert.equal(g.state.phase, 'ready');
  assert.equal(g.state.elapsed, 0);
});

test('high-speed cue hits small enemies between frame endpoints', () => {
  const g = game();
  Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 1250, vy: 0 });
  const target = enemy(1000, 175, 150, { r: 8 });
  g.state.enemies.push(target);
  g.update(0.1);
  assert.ok(target.hp < target.maxHp, 'substeps must detect the intervening target');
  assert.ok(target.vx > 0, 'the target receives momentum');
});

test('ball collisions transfer momentum into a stationary ball', () => {
  const g = game();
  Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 700, vy: 0 });
  const other = { id: 200, type: 'iron', x: 180, y: 150, vx: 0, vy: 0, r: 16, mass: 3, charge: 0 };
  g.state.balls.push(other);
  g.update(0.12);
  assert.ok(other.vx > 250);
  assert.ok(g.state.balls[0].vx < 0, 'the lighter cue rebounds');
});

test('cue rebounds off the base without harming it', () => {
  const g = game();
  const hp = g.state.hp;
  Object.assign(g.state.balls[0], { x: 500, y: 450, vx: 0, vy: -1000 });
  g.update(0.1);
  assert.equal(g.state.hp, hp);
  assert.ok(g.state.balls[0].vy > 0);
  assert.ok(g.state.balls[0].y >= 360 + WORLD.baseRadius + g.state.balls[0].r);
});

test('an enemy entering the base deals damage exactly once and is removed', () => {
  const g = game();
  const hp = g.state.hp;
  g.state.enemies.push(enemy(1000, 500, 390));
  g.update(0.01);
  assert.equal(g.state.hp, hp - 5);
  assert.equal(g.state.enemies.length, 0);
  g.update(0.01);
  assert.equal(g.state.hp, hp - 5);
  assert.equal(g.state.kills, 0);
});

test('recall repositions only the cue and cannot bypass its cooldown', () => {
  const g = game();
  Object.assign(g.state.balls[0], { x: 90, y: 90, vx: 700, vy: 100 });
  assert.equal(g.recall(), true);
  assert.equal(g.state.balls[0].x, 500);
  assert.equal(g.state.balls[0].y, 460);
  assert.equal(g.state.balls[0].vx, 0);
  assert.equal(g.recall(), false);
  g.update(1);
  assert.ok(g.state.recallCooldown > 5.9 && g.state.recallCooldown < 6.1);
  g.state.recallCooldown = 0;
  assert.equal(g.recall(), true);
});

test('collecting experience offers a free three-way upgrade without spending enchantment currency', () => {
  const g = game();
  const cue = g.state.balls[0];
  g.state.experienceOrbs.push({ id: 1000, x: cue.x, y: cue.y, r: 5, value: 5 });
  g.update(0.1);
  assert.equal(g.state.phase, 'upgrade');
  assert.equal(g.state.level, 2);
  assert.equal(g.state.xpNext, 9);
  assert.equal(g.state.xp, 5, 'experience is retained as spendable enchantment currency');
  assert.equal(g.state.pendingUpgrades, 1);
  assert.equal(g.state.levelXp, 0);
  assert.equal(g.state.choices.length, 3);
  assert.equal(new Set(g.state.choices).size, 3);
  assert.deepEqual(new Set(g.state.choices.map(id => UPGRADES.find(u => u.id === id).category)), new Set(['rod', 'ball']));
  assert.deepEqual(g.state.upgrades, {});
  assert.equal(g.chooseUpgrade('invented-upgrade'), false);
  const time = g.state.elapsed;
  g.update(0.1);
  assert.equal(g.state.elapsed, time);
  const chosen = g.state.choices[0];
  assert.equal(g.chooseUpgrade(chosen), true);
  assert.equal(g.state.upgrades[chosen], 1);
  assert.equal(g.state.pendingUpgrades, 0);
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.state.xp, 5);
  assert.equal(g.state.totalXp, 5);
});

test('persistent elemental and iron balls are unique across upgrade levels', () => {
  const g = game();
  for (const id of ['iron', 'storm', 'frost']) {
    for (let i = 0; i < 3; i += 1) {
      g._applyUpgrade(id);
    }
    assert.equal(g.state.balls.filter(b => b.type === id).length, 1);
  }
  assert.equal(g.state.balls.length, 4);
});

test('paused and terminal states freeze time, movement, shots and cooldowns', () => {
  const g = game();
  assert.equal(g.shoot(0, 1), true);
  assert.equal(g.shoot(0, 1), false);
  assert.equal(g.togglePause(), true);
  const snapshot = structuredClone(g.state);
  g.update(10);
  assert.deepEqual(g.state, snapshot);
  assert.equal(g.shoot(0, 1), false);
  assert.equal(g.recall(), false);
  assert.equal(g.togglePause(), true);
  g.state.hp = 0;
  g.update(0.1);
  assert.equal(g.state.phase, 'lost');
  const ended = structuredClone(g.state);
  g.update(100);
  assert.deepEqual(g.state, ended);
  assert.equal(g.togglePause(), false);
});

test('elapsed wall time alone neither advances the expedition nor spawns the old timed bosses', () => {
  const g = game();
  g.state.elapsed = 3599.99;
  g._spawnTimer = Infinity;
  g.update(0.03);
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.state.stage, 'overworld');
  assert.equal(g.state.duration, null);
  assert.equal(g.state.bossesSpawned.length, 0);
  assert.match(g.getObjective(), /黑曜石/);
});

test('defeating the final End dragon wins without a timer and emits one end event', () => {
  const events = [];
  const g = new Game({ random: () => 0.55, onEvent: event => events.push(event) });
  g.start();
  g._changeStage('end'); g._spawnTimer = Infinity;
  for (const crystal of g.state.crystals) g._damageCrystal(crystal, 180);
  const boss = g.state.enemies.find(e => e.kind === 'dragon');
  Object.assign(boss, { x: 190, y: 150, hp: 1, speed: 0 });
  Object.assign(g.state.balls[0], { x: 140, y: 150, vx: 1000, vy: 0 });
  g.update(0.1);
  assert.equal(g.state.phase, 'won');
  assert.equal(g.state.kills, 1);
  const atEnd = g.state.elapsed;
  g.update(50);
  assert.equal(g.state.elapsed, atEnd);
  assert.equal(events.filter(e => e.type === 'end').length, 1);
});

test('finite-duration ghost balls expire, and all ball speeds are capped', () => {
  const g = game();
  g.state.upgrades.echo = 3;
  assert.equal(g.shoot(0, 1), true);
  assert.equal(g.state.balls.filter(b => b.type === 'ghost').length, 3);
  g.state.balls[0].vx = 100000;
  g.update(0.01);
  assert.ok(Math.hypot(g.state.balls[0].vx, g.state.balls[0].vy) <= 1250);
  g.update(4);
  assert.equal(g.state.balls.filter(b => b.type === 'ghost').length, 0);
});

test('striking a storm ball chains lightning into nearby enemies', () => {
  const events = [];
  const g = new Game({ random: () => 0.55, onEvent: event => events.push(event) });
  g.start();
  Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 700, vy: 0 });
  g.state.balls.push({ id: 200, type: 'storm', x: 180, y: 150, vx: 0, vy: 0, r: 12, mass: 1, charge: 0 });
  const first = enemy(1000, 190, 230);
  const second = enemy(1001, 290, 230);
  g.state.enemies.push(first, second);
  g.update(0.08);
  assert.ok(first.hp < 100);
  assert.ok(second.hp < 100);
  assert.equal(events.filter(e => e.type === 'lightning').length, 4, 'both participants inherit storm and discharge their own two-target chains');
});

test('striking a frost ball slows nearby enemies without needing a direct hit', () => {
  const g = game();
  Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 700, vy: 0 });
  g.state.balls.push({ id: 200, type: 'frost', x: 180, y: 150, vx: 0, vy: 0, r: 13, mass: 1.25, charge: 0 });
  const target = enemy(1000, 190, 240);
  g.state.enemies.push(target);
  g.update(0.08);
  assert.ok(target.slowTimer > 0);
  assert.equal(target.hp, 100);
});

test('unlocking a persistent ball at capacity replaces a ghost rather than exceeding the cap', () => {
  const g = game();
  for (let i = 0; i < 17; i += 1) {
    g.state.balls.push({ id: 200 + i, type: 'ghost', x: 80 + i * 30, y: 150, vx: 0, vy: 0, r: 8, mass: 0.55, charge: 0, life: 3 });
  }
  g._applyUpgrade('iron');
  assert.equal(g.state.balls.length, 18);
  assert.equal(g.state.balls.filter(b => b.type === 'iron').length, 1);
  assert.equal(g.state.balls.filter(b => b.type === 'cue').length, 1);
});

test('a player can strike a selected persistent block without striking the cue', () => {
  const g = game();
  upgrade(g, 'iron');
  const cue = g.state.balls.find(b => b.type === 'cue');
  const iron = g.state.balls.find(b => b.type === 'iron');
  Object.assign(iron, { vx: 0, vy: 900 });
  assert.equal(g.shoot(0, 0.5, iron.id), true);
  assert.equal(iron.vx, 715);
  assert.equal(iron.vy, 0);
  assert.equal(cue.vx, 0);
  assert.equal(cue.vy, 0);
  assert.equal(g.state.shots, 1);
});

test('every selectable block follows the new aim exactly, discarding perpendicular old velocity', () => {
  for (const type of ['cue', 'iron', 'storm', 'frost']) {
    const g = game();
    if (type !== 'cue') upgrade(g, type);
    const ball = g.state.balls.find(b => b.type === type);
    Object.assign(ball, { vx: 0, vy: 1200 });
    assert.equal(g.shoot(0, 1, ball.id), true);
    assert.equal(ball.vx, 1140, `${type} should have only the new shot speed`);
    assert.equal(ball.vy, 0, `${type} must discard the old vertical component`);
  }
});

test('missing and ghost targets are rejected without spending a shot', () => {
  const g = game();
  g.state.balls.push({ id: 200, type: 'ghost', x: 100, y: 100, vx: 0, vy: 0, r: 8, mass: 0.55, charge: 0, life: 3 });
  assert.equal(g.shoot(0, 1, 9999), false);
  assert.equal(g.shoot(0, 1, 200), false);
  assert.equal(g.state.shots, 0);
  assert.equal(g.shoot(0, 1), true, 'rejected selections must not consume the cooldown');
});

test('the bone rod raises actual collision damage by 25 percent', () => {
  function impact(withBone) {
    const g = game();
    if (withBone) upgrade(g, 'rod');
    Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 0, vy: 0 });
    assert.equal(g.shoot(0, 1), true);
    const target = enemy(1000, 175, 150, { hp: 1000, maxHp: 1000 });
    g.state.enemies.push(target);
    g.update(0.05);
    return 1000 - target.hp;
  }
  const ordinary = impact(false);
  assert.ok(ordinary > 0);
  assert.ok(Math.abs(impact(true) / ordinary - 1.25) < 1e-9);
});

test('the end rod strengthens aim time dilation while echo remains the source of expiring ghost blocks', () => {
  const g = game();
  upgrade(g, 'rod');
  upgrade(g, 'rod');
  assert.equal(g.shoot(0, 1), true);
  assert.equal(g.state.balls.filter(b => b.type === 'ghost').length, 0);
  assert.equal(g.beginAim(g.state.balls[0].id), true);
  assert.equal(g.getAimInfo().timeScale, 0.15);
  g.advanceAim(0.5);
  g.state.rodEnchantments.end.echo = 1;
  assert.equal(g.shoot(0, 1), true);
  assert.equal(g.state.balls.filter(b => b.type === 'ghost').length, 1);
  g.update(3);
  assert.equal(g.state.balls.filter(b => b.type === 'ghost').length, 0);
});

test('the blaze rod damages nearby targets with a bounded, shared explosion cooldown', () => {
  const events = [];
  const g = new Game({ random: () => 0.55, onEvent: event => events.push(event) });
  g.start();
  for (let i = 0; i < 3; i += 1) upgrade(g, 'rod');
  assert.equal(g.shoot(0, 1), true, 'the strike records the equipped blaze rod');
  const strike = id => {
    Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 1000, vy: 0 });
    const direct = enemy(id, 175, 150, { hp: 1000, maxHp: 1000 });
    const near = enemy(id + 1, 190, 225, { hp: 1000, maxHp: 1000 });
    const far = enemy(id + 2, 190, 320, { hp: 1000, maxHp: 1000 });
    g.state.enemies = [direct, near, far];
    g.update(0.05);
    return { near, far };
  };
  const first = strike(1000);
  assert.ok(first.near.hp < 1000, 'splash reaches a nearby enemy not touched by the block');
  assert.equal(first.far.hp, 1000, 'the explosion has a finite radius');
  assert.equal(events.filter(e => e.type === 'pulse' && e.source === 'rod').length, 1);
  const second = strike(2000);
  assert.equal(second.near.hp, 1000, 'a different contact cannot bypass the shared cooldown');
  assert.equal(events.filter(e => e.type === 'pulse' && e.source === 'rod').length, 1);
});

test('base shields absorb damage before health and allow partial spillover', () => {
  const g = game();
  upgrade(g, 'shield');
  assert.equal(g.state.maxShield, 30);
  assert.equal(g.state.shield, 30);
  g.state.enemies.push(enemy(1000, 500, 390));
  g.update(0.01);
  assert.equal(g.state.hp, 120);
  assert.equal(g.state.shield, 25);
  g.state.shield = 3;
  g.state.enemies.push(enemy(1001, 500, 390));
  g.update(0.01);
  assert.equal(g.state.shield, 0);
  assert.equal(g.state.hp, 118);
});

test('boss breaches respect shields and leave the surviving boss fight playable', () => {
  const g = game();
  upgrade(g, 'shield');
  const boss = enemy(1000, 500, 390, { kind: 'boss', hp: 380, maxHp: 380, r: 28, speed: 7.5 });
  g.state.enemies.push(boss);
  g.update(0.01);
  assert.equal(g.state.shield, 0);
  assert.equal(g.state.hp, 30);
  assert.equal(g.state.phase, 'playing');
  assert.ok(g.state.enemies.includes(boss));
  assert.ok(boss.hp > 0);
  assert.ok(Math.hypot(boss.x - 500, boss.y - 360) > WORLD.baseRadius + boss.r);
});

test('stacked regeneration heals on ten-second game-time intervals, stops while paused, and respects max health', () => {
  const g = game();
  upgrade(g, 'regen');
  upgrade(g, 'regen');
  g._spawnTimer = Infinity;
  g.state.hp = 60;
  g.update(9.9);
  assert.equal(g.state.hp, 60);
  const timer = g.state.regenTimer;
  g.togglePause();
  g.update(20);
  assert.equal(g.state.regenTimer, timer);
  assert.equal(g.state.hp, 60);
  g.togglePause();
  g.update(0.11);
  assert.equal(g.state.hp, 72);
  g.update(10);
  assert.equal(g.state.hp, 84);
  g.state.hp = g.state.maxHp - 1;
  g.update(10);
  assert.equal(g.state.hp, g.state.maxHp);
});

test('base collisions emit a damaging pulse with a shared cooldown and finite range', () => {
  const events = [];
  const g = new Game({ random: () => 0.55, onEvent: event => events.push(event) });
  g.start();
  upgrade(g, 'pulse');
  const near = enemy(1000, 580, 360);
  const far = enemy(1001, 720, 360);
  g.state.enemies.push(near, far);
  Object.assign(g.state.balls[0], { x: 500, y: 450, vx: 0, vy: -1000 });
  g.update(0.08);
  assert.equal(near.hp, 68);
  assert.equal(far.hp, 100);
  assert.equal(g.state.hp, 120);
  assert.equal(events.filter(e => e.type === 'pulse' && e.source === 'base').length, 1);
  Object.assign(g.state.balls[0], { x: 500, y: 450, vx: 0, vy: -1000 });
  g.update(0.08);
  assert.equal(near.hp, 68);
  assert.equal(events.filter(e => e.type === 'pulse' && e.source === 'base').length, 1);
  assert.ok(g.state.pulseCooldown > 0);
});

test('one large experience pickup queues every crossed level and choices preserve all spendable XP', () => {
  const g = game();
  const cue = g.state.balls[0];
  g.state.experienceOrbs.push({ id: 1000, x: cue.x, y: cue.y, r: 5, value: 50 });
  g.update(0.01);
  assert.equal(g.state.level, 5);
  assert.equal(g.state.totalXp, 50);
  assert.equal(g.state.xp, 50);
  assert.equal(g.state.levelXp, 3);
  assert.equal(g.state.xpNext, 24);
  assert.equal(g.state.pendingUpgrades, 4);
  const time = g.state.elapsed;
  for (let remaining = 4; remaining > 0; remaining -= 1) {
    assert.equal(g.state.phase, 'upgrade');
    assert.equal(g.state.pendingUpgrades, remaining);
    assert.equal(g.chooseUpgrade(g.state.choices[0]), true);
    assert.equal(g.state.xp, 50);
    assert.equal(g.state.totalXp, 50);
    assert.equal(g.state.elapsed, time);
  }
  assert.equal(g.state.phase, 'playing');
  assert.deepEqual(g.state.choices, []);
});

test('combined end-rod and echo volleys preserve the global block count limit', () => {
  const g = game();
  upgrade(g, 'rod');
  upgrade(g, 'rod');
  for (let i = 0; i < 3; i += 1) upgrade(g, 'echo');
  for (let i = 0; i < 14; i += 1) {
    g.shoot(0, 1);
    assert.ok(g.state.balls.length <= 18);
    g.update(0.3);
    assert.ok(g.state.balls.length <= 18);
  }
  for (const type of ['iron', 'storm', 'frost']) {
    upgrade(g, type);
    assert.ok(g.state.balls.length <= 18);
    assert.equal(g.state.balls.filter(b => b.type === type).length, 1);
  }
});

test('aiming holds only the selected block while the world advances slowly and the shot lock follows real time', () => {
  const g = game();
  g.recall();
  g.state.enemies.push(enemy(1000, 100, 100, { speed: 40 }));
  assert.equal(g.shoot(0, 1), true);
  assert.equal(g.shoot(Math.PI / 2, 1), false);
  const ball = g.state.balls[0];
  assert.equal(g.beginAim(ball.id), true);
  const x = ball.x, y = ball.y;
  const simulated = g.advanceAim(0.5);
  assert.ok(Math.abs(simulated - 0.15) < 1e-9);
  assert.equal(ball.x, x); assert.equal(ball.y, y);
  assert.ok(g.state.enemies[0].x > 100);
  assert.equal(g.shoot(Math.PI / 2, 1), true);
  assert.ok(Math.abs(g.state.elapsed - 0.15) < 1e-9);
  assert.ok(Math.abs(g.state.recallCooldown - 6.85) < 1e-9);
});

test('aim time is ignored while paused and rejects invalid durations', () => {
  const g = game();
  assert.equal(g.shoot(0, 1), true);
  g.togglePause();
  g.advanceAim(1);
  g.togglePause();
  assert.equal(g.shoot(0, 1), false, 'pause must not consume the shot lock');
  assert.equal(g.beginAim(g.state.balls[0].id), true);
  for (const dt of [NaN, Infinity, -1, 0]) {
    g.advanceAim(dt);
    assert.equal(g.shoot(0, 1), false);
  }
  g.advanceAim(0.5);
  assert.equal(g.shoot(0, 1), true);
});

test('strong friction slows a full-power block and stops it within four seconds', () => {
  const g = game();
  g.state.resources = [];
  Object.assign(g.state.balls[0], { x: 100, y: 100, vx: 1140, vy: 0 });
  g.update(2);
  assert.ok(Math.hypot(g.state.balls[0].vx, g.state.balls[0].vy) < 450);
  g.update(2);
  assert.equal(g.state.balls[0].vx, 0);
  assert.equal(g.state.balls[0].vy, 0);
});

test('walls dissipate momentum rather than preserving full speed', () => {
  const g = game();
  Object.assign(g.state.balls[0], { x: 945, y: 100, vx: 500, vy: 0 });
  g.update(0.04);
  assert.ok(g.state.balls[0].vx < 0);
  assert.ok(Math.abs(g.state.balls[0].vx) < 400);
});

test('trees and ores require repeated hand-tool impacts and grant materials exactly once on destruction', () => {
  for (const kind of ['tree', 'ore']) {
    const g = game();
    g.state.resources = [];
    g._spawnTimer = Infinity;
    const resource = g._spawnResource(kind, 175, 150);
    const initial = structuredClone(g.state.materials);
    let hits = 0;
    while (resource.hp > 0 && hits < 15) {
      Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 1100, vy: 0 });
      g.update(.06); hits++;
      if (hits === 1) { assert.ok(resource.hp > 0); assert.deepEqual(g.state.materials, initial); }
      Object.assign(g.state.balls[0], { x: 100, y: 100, vx: 0, vy: 0 });
      if (resource.hp > 0) g.update(.4);
    }
    assert.ok(hits > 1 && hits < 15);
    assert.equal(g.state.resources.length, 0);
    if (kind === 'tree') assert.equal(g.state.materials.wood, 5);
    else { assert.equal(g.state.materials.stone, 6); assert.equal(g.state.materials.iron, 2); }
    const materials = structuredClone(g.state.materials);
    g.update(0.1);
    assert.deepEqual(g.state.materials, materials);
  }
});

test('crafting validates prerequisites and atomically consumes the exact material cost while paused', () => {
  const g = game();
  g.state.materials.bone = 3;
  g.togglePause();
  assert.equal(g.canCraft('bone_rod').ok, true);
  assert.equal(g.craft('bone_rod'), true);
  assert.equal(g.state.phase, 'paused');
  assert.equal(g.state.upgrades.rod, 1);
  assert.equal(g.state.materials.wood, 0);
  assert.equal(g.state.materials.bone, 0);
  const spent = structuredClone(g.state.materials);
  assert.equal(g.craft('bone_rod'), false);
  assert.equal(g.craft('blaze_rod'), false);
  assert.equal(g.craft('unknown'), false);
  assert.deepEqual(g.state.materials, spent);
  assert.equal(typeof g.canCraft('end_rod').reason, 'string');
});

test('spendable XP balance alone cannot fabricate level rewards or unlock material-crafted rods', () => {
  const g = game();
  g.state.xp = 500;
  g.update(0.01);
  assert.equal(g.state.phase, 'playing');
  assert.deepEqual(g.state.choices, []);
  assert.deepEqual(g.state.ownedRods, ['wood']);
  const materials = structuredClone(g.state.materials);
  assert.equal(g.craft('bone_rod'), false);
  assert.equal(g.chooseUpgrade('rod'), false);
  assert.deepEqual(g.state.materials, materials);
  assert.equal(g.state.xp, 500);
});

test('shield zombies require the shield to break before health can fall', () => {
  const g = game();
  const target = g._spawnEnemy('shield_zombie', { x: 175, y: 150, speed: 0 });
  Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 900, vy: 0 });
  g.update(0.05);
  assert.ok(target.shield < target.maxShield);
  assert.equal(target.hp, target.maxHp);
  Object.assign(g.state.balls[0], { vx: 0, vy: 0 });
  Object.assign(target, { vx: 0, vy: 0 });
  g.update(0.25);
  Object.assign(target, { x: 175, y: 150, vx: 0, vy: 0 });
  Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 900, vy: 0 });
  g.update(0.05);
  assert.equal(target.shield, 0);
  assert.ok(target.hp < target.maxHp);
});

test('slimes split twice into progressively smaller slimes and then stop splitting', () => {
  const g = game();
  g._spawnEnemy('slime', { x: 200, y: 150, size: 3 });
  g.state.xpNext = 999;
  for (const target of [...g.state.enemies]) g._damage(target, 1000, '#fff');
  assert.equal(g.state.enemies.filter(e => e.hp > 0 && e.kind === 'slime' && e.size === 2).length, 2);
  for (const target of [...g.state.enemies]) g._damage(target, 1000, '#fff');
  assert.equal(g.state.enemies.filter(e => e.hp > 0 && e.kind === 'slime' && e.size === 1).length, 4);
  for (const target of [...g.state.enemies]) g._damage(target, 1000, '#fff');
  assert.equal(g.state.enemies.filter(e => e.hp > 0).length, 0);
});

test('endermen teleport away from incoming blocks with a cooldown', () => {
  const g = game();
  const target = g._spawnEnemy('enderman', { x: 250, y: 150, speed: 0 });
  Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 700, vy: 0 });
  g.update(0.01);
  assert.ok(Math.abs(target.y - 150) > 80);
  assert.ok(target.teleportCooldown > 5.9);
  const y = target.y;
  g.update(0.01);
  assert.equal(target.y, y);
});

test('enderman QTE holds a block, rejects shooting and recall, and releases after seven clicks without adding shots', () => {
  const g = game();
  const enderman = g._spawnEnemy('enderman', { x: 180, y: 150, speed: 0 });
  const ball = g.state.balls[0];
  Object.assign(ball, { x: 145, y: 150, vx: 0, vy: 0 });
  g.update(0.01);
  assert.equal(ball.heldBy, enderman.id);
  assert.equal(g.state.qte.remainingClicks, 7);
  assert.equal(g.shoot(0, 1, ball.id), false);
  assert.equal(g.recall(), false);
  assert.equal(g.clickQte(-1), false);
  for (let i = 0; i < 7; i += 1) assert.equal(g.clickQte(enderman.id), true);
  assert.equal(g.state.qte, null);
  assert.equal(ball.heldBy, undefined);
  assert.equal(g.state.shots, 0);
  assert.equal(g.shoot(0, 1, ball.id), true);
});

test('killing an enderman releases its captured block and drops only an end pearl', () => {
  const g = game();
  const enderman = g._spawnEnemy('enderman', { x: 180, y: 150, speed: 0 });
  Object.assign(g.state.balls[0], { x: 145, y: 150 });
  g.update(0.01);
  g._damage(enderman, 1000, '#fff');
  assert.equal(g.state.qte, null);
  assert.equal(g.state.balls[0].heldBy, undefined);
  assert.equal(g.state.materials.endPearl, 1);
  assert.equal(g.state.materials.blazeRod, 0);
});

test('skeleton arrows are enemy projectiles that damage the base', () => {
  const g = game();
  g._spawnEnemy('skeleton', { x: 200, y: 150, speed: 0, attackCooldown: 0 });
  g.update(0.01);
  const arrow = g.state.projectiles.find(p => p.kind === 'arrow');
  assert.equal(arrow.owner, 'enemy');
  Object.assign(arrow, { x: 500, y: 310, vx: 0, vy: 200 });
  g.update(0.05);
  assert.equal(g.state.hp, 117);
  assert.ok(!g.state.projectiles.includes(arrow));
});

test('blaze contact ignites blocks and its death drops blaze rods', () => {
  const g = game();
  g._spawnEnemy('blaze', { x: 175, y: 150, speed: 0, hp: 1 });
  Object.assign(g.state.balls[0], { x: 120, y: 150, vx: 1000, vy: 0 });
  g.update(0.05);
  assert.ok(g.state.balls[0].fireTimer > 4.9);
  assert.equal(g.state.materials.blazeRod, 2);
});

test('creeper death damages nearby enemies and a nearby base after its visible fuse', () => {
  const g = game();
  g._spawnEnemy('creeper', { x: 600, y: 360, speed: 0 });
  const neighbor = g._spawnEnemy('zombie', { x: 660, y: 360, hp: 100, maxHp: 100, speed: 0 });
  g.update(0.1);
  assert.ok(g.state.enemies.find(e => e.kind === 'creeper').fuse > 0);
  assert.equal(g.state.hp, 120);
  g.update(1.6);
  assert.equal(g.state.hp, 105);
  assert.equal(neighbor.hp, 50);
  assert.equal(g.state.materials.gunpowder, 2);
});

test('optional bosses use their realm wave fallbacks while the dragon remains locked behind crystals', () => {
  const events = [];
  const g = new Game({ random: () => 0.55, onEvent: event => events.push(event) });
  g.start();
  g._spawnTimer = Infinity; g.state.stageElapsed = 299.99; g._lastStageWave = 10;
  g.update(.02);
  assert.ok(!g.state.bossesSpawned.includes('warden'), 'the seeded chance misses wave eleven');
  g.state.stageElapsed = 419.99; g._lastStageWave = 14; g.update(.02);
  assert.ok(g.state.bossesSpawned.includes('warden'));
  g._onStageWave(16);
  assert.equal(g.state.enemies.filter(e => e.kind === 'warden').length, 1);
  g._changeStage('nether'); g._spawnTimer = Infinity;
  assert.ok(!g.state.bossesSpawned.includes('wither'));
  g.state.stageElapsed = 149.99; g._lastStageWave = 5; g.update(.02);
  assert.ok(g.state.bossesSpawned.includes('wither'));
  g._changeStage('end'); g._spawnTimer = Infinity; g.state.stageElapsed = 300; g._lastStageWave = 11; g.update(.01);
  assert.ok(!g.state.bossesSpawned.includes('dragon'));
  assert.equal(g.state.duration, null);
  assert.deepEqual(events.filter(e => e.type === 'bossIntro').map(e => e.kind), ['warden', 'wither']);
});

test('wither volleys, dragon charges, and warden sonic attacks have distinct effects', () => {
  for (const kind of ['wither', 'dragon', 'warden']) {
    const g = game();
    const boss = g._spawnEnemy(kind, { x: 600, y: 450, speed: 0, attackCooldown: 0 });
    g.update(0.01);
    if (kind === 'wither') assert.equal(g.state.projectiles.filter(p => p.kind === 'wither').length, 3);
    if (kind === 'dragon') { assert.equal(g.state.projectiles.length, 3); assert.ok(Math.hypot(boss.vx, boss.vy) > 200); }
    if (kind === 'warden') assert.equal(g.state.hp, 115);
  }
});

test('optional boss kills do not win and final dragon victory does not require either optional boss', () => {
  const g = game();
  g._spawnTimer = Infinity;
  const warden = g._spawnEnemy('warden', { x: 200, y: 120, hp: 1, speed: 0 });
  g._damage(warden, 1, '#fff'); g.update(.01);
  assert.equal(g.state.phase, 'playing');
  const final = game(); final._changeStage('end'); final._spawnTimer = Infinity;
  for (const crystal of final.state.crystals) final._damageCrystal(crystal, 180);
  const dragon = final.state.enemies.find(e => e.kind === 'dragon');
  final._damage(dragon, dragon.hp, '#fff'); final.update(.01);
  assert.equal(final.state.phase, 'won');
  assert.deepEqual(final.state.bossesDefeated, ['dragon']);
});

test('golem recipes enforce two of each kind and both allies attack with their distinct weapons', () => {
  const g = game();
  g.state.materials = { ...g.state.materials, iron: 100, stone: 100, wood: 100 };
  for (const kind of ['iron_golem', 'snow_golem']) {
    assert.equal(g.craft(kind), true);
    assert.equal(g.craft(kind), true);
    const before = structuredClone(g.state.materials);
    assert.equal(g.craft(kind), false);
    assert.deepEqual(g.state.materials, before);
  }
  assert.equal(g.state.allies.length, 4);
  const iron = g.state.allies.find(a => a.kind === 'iron_golem');
  const snow = g.state.allies.find(a => a.kind === 'snow_golem');
  g.state.allies = [iron, snow];
  Object.assign(iron, { x: 200, y: 150 });
  Object.assign(snow, { x: 100, y: 250 });
  const target = g._spawnEnemy('zombie', { x: 250, y: 150, hp: 1000, maxHp: 1000, speed: 0 });
  g.update(1.4);
  assert.ok(target.hp < 970);
  assert.ok(target.slowTimer > 0);
  assert.ok(iron.x > 200);
});

test('TNT crafting creates a persistent block while potion remains an inventory consumable', () => {
  const g = game();
  Object.assign(g.state.materials, { gunpowder: 3, wood: 1, bone: 2, stone: 2 });
  assert.equal(g.craft('tnt'), true);
  assert.equal(g.craft('potion'), true);
  const tnt = g.state.balls.find(b => b.type === 'tnt');
  assert.ok(tnt);
  assert.equal(tnt.r, 15);
  assert.equal(tnt.mass, 1.2);
  assert.equal(tnt.life, undefined);
  assert.equal('tnt' in g.state.items, false);
  assert.equal(g.state.items.potion, 1);
  g.state.hp = 60;
  assert.equal(g.usePotion(), true);
  assert.equal(g.state.hp, 95);
  assert.equal(g.usePotion(), false);
  assert.equal(g.useTnt(500, 360), false);
  assert.equal(g.useItem('tnt', 500, 360), false);
  assert.equal(g.shoot(0, 1, tnt.id), true);
  assert.equal(tnt.vx, 1140);
});

test('enemy, projectile, and resource populations have hard caps', () => {
  const g = game();
  for (let i = 0; i < 150; i += 1) g._spawnEnemy('zombie');
  for (let i = 0; i < 200; i += 1) g._spawnProjectile('enemy', 'arrow', 100, 100, 0, 1);
  for (let i = 0; i < 50; i += 1) g._spawnResource('tree', 85 + i % 10 * 85, 85 + Math.floor(i / 10) * 100);
  assert.equal(g.state.enemies.length, 120);
  assert.ok(g.state.projectiles.length <= 160);
  assert.ok(g.state.resources.length <= 10);
});

test('trees regrow naturally and new ores announce a brief falling phase before becoming harvestable', () => {
  let seed = 1;
  const events = [];
  const g = new Game({ random: () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296), onEvent: event => events.push(event) });
  g.start();
  g.state.resources = [];
  g._spawnTimer = Infinity;
  g.update(8.1);
  assert.ok(g.state.resources.some(r => r.kind === 'tree'));
  g.update(4);
  const ore = g.state.resources.find(r => r.kind === 'ore');
  assert.ok(ore);
  assert.ok(ore.fallTimer > 0);
  assert.equal(events.filter(e => e.type === 'oreFall').length, 1);
  g.update(1);
  assert.equal(ore.fallTimer, 0);
});

test('skeleton kills automatically collect bones for rod crafting', () => {
  const g = game();
  const skeleton = g._spawnEnemy('skeleton', { x: 200, y: 150, speed: 0 });
  g._damage(skeleton, 1000, '#fff');
  assert.equal(g.state.materials.bone, 2);
});

test('station recipes gate each enchant mode and successful transactions spend their exact XP cost', () => {
  const g = game(), target = { kind: 'rod', id: 'wood' };
  g.state.xp = 30;
  g.state.books.power = 1;
  const before = structuredClone(g.state);
  for (const mode of ['random', 'add', 'book']) assert.equal(g.enchant(target, mode, 'power'), false);
  assert.deepEqual(g.state, before);
  g.togglePause();
  for (const [recipeId, flag] of [['enchanting_table', 'enchantingTable'], ['anvil', 'anvil']]) {
    const recipe = RECIPES.find(r => r.id === recipeId);
    for (const [key, value] of Object.entries(recipe.cost)) g.state.materials[key] = value;
    const materials = structuredClone(g.state.materials);
    assert.equal(g.craft(recipeId), true);
    assert.equal(g.state.stations[flag], true);
    for (const [key, value] of Object.entries(recipe.cost)) assert.equal(g.state.materials[key], materials[key] - value);
    const spent = structuredClone(g.state.materials);
    assert.equal(g.craft(recipeId), false);
    assert.deepEqual(g.state.materials, spent);
    if (recipeId === 'enchanting_table') {
      assert.equal(g.enchant(target, 'random'), true);
      assert.equal(g.state.xp, 22);
      assert.equal(g.enchant(target, 'add'), false);
      assert.equal(g.enchant(target, 'book', 'power'), false);
    }
  }
  assert.equal(g.enchant(target, 'add'), true);
  assert.equal(g.state.xp, 12);
  assert.equal(g.enchant(target, 'book', 'power'), true);
  assert.equal(g.state.xp, 9);
  assert.equal(g.state.books.power, 0);
  assert.equal(g.state.phase, 'paused');
});

test('random rerolls replace only the selected rod or block with two distinct legal enchantments', () => {
  for (const kind of ['rod', 'ball']) {
    const g = game(), ball = g.state.balls[0];
    g.state.stations.enchantingTable = true;
    g.state.xp = 8;
    g.state.rodEnchantments.wood = { power: 4, charge: 2, crit: 2, echo: 2 };
    g.state.rodEnchantments.bone = { power: 5 };
    ball.enchantments = { power: 4, crit: 3, ricochet: 2, frost_touch: 2 };
    g.state.baseEnchantments = { shield: 2, regen: 2, pulse: 2, repair: 2 };
    const target = { kind, id: kind === 'rod' ? 'wood' : kind === 'base' ? 'core' : ball.id };
    const before = structuredClone({ rods: g.state.rodEnchantments, ball: ball.enchantments, base: g.state.baseEnchantments });
    assert.equal(g.enchant(target, 'random'), true);
    const result = g.describeEnchantTarget(target);
    assert.equal(Object.keys(result.enchantments).length, 2);
    assert.ok(Object.entries(result.enchantments).every(([id, rank]) => result.pool.includes(id) && rank === 1));
    assert.equal(g.state.xp, 0);
    assert.deepEqual(g.state.rodEnchantments.bone, before.rods.bone);
    if (kind !== 'rod') assert.deepEqual(g.state.rodEnchantments, before.rods);
    if (kind !== 'ball') assert.deepEqual(ball.enchantments, before.ball);
    if (kind !== 'base') assert.deepEqual(g.state.baseEnchantments, before.base);
  }
});

test('invalid targets, incompatible books and insufficient XP reject without consuming anything', () => {
  const g = game(), ball = g.state.balls[0], target = { kind: 'rod', id: 'wood' };
  Object.assign(g.state.stations, { enchantingTable: true, anvil: true });
  g.state.books = { power: 2, shield: 1 };
  for (const [mode, xp] of [['random', 7], ['add', 9], ['book', 2]]) {
    g.state.xp = xp;
    const before = structuredClone(g.state);
    assert.equal(g.enchant(target, mode, 'power'), false);
    assert.deepEqual(g.state, before);
  }
  g.state.xp = 40;
  const ghost = g._newBall('ghost', 100, 100); ghost.life = 2; g.state.balls.push(ghost);
  for (const invalid of [null, { kind: 'rod', id: 'blaze' }, { kind: 'base', id: 'missing' }, { kind: 'ball', id: 999999 }, { kind: 'ball', id: String(ball.id) }, { kind: 'ball', id: ghost.id }]) {
    const before = structuredClone(g.state);
    assert.equal(g.enchant(invalid, 'book', 'power'), false);
    assert.deepEqual(g.state, before);
  }
  ball.heldBy = 1000;
  const before = structuredClone(g.state);
  assert.equal(g.enchant({ kind: 'ball', id: ball.id }, 'book', 'power'), false);
  assert.equal(g.enchant({ kind: 'base', id: 'core' }, 'book', 'power'), false);
  assert.equal(g.enchant(target, 'book', 'missing-book'), false);
  assert.deepEqual(g.state, before);
});

test('four filled slots allow existing enchantment upgrades but reject a fifth type and maxed upgrades', () => {
  const g = game(), target = { kind: 'rod', id: 'wood' };
  g.state.stations.anvil = true;
  g.state.xp = 30;
  g.state.books = { power: 2, echo: 1 };
  g.state.rodEnchantments.wood = { power: 1, charge: 4, knockback: 4, crit: 4 };
  const full = structuredClone(g.state);
  assert.equal(g.enchant(target, 'book', 'echo'), false);
  assert.deepEqual(g.state, full);
  assert.equal(g.enchant(target, 'add'), true, 'power is the only valid remaining upgrade');
  assert.equal(g.state.rodEnchantments.wood.power, 2);
  assert.equal(g.state.xp, 20);
  assert.equal(g.enchant(target, 'book', 'power'), true);
  assert.equal(g.state.rodEnchantments.wood.power, 3);
  assert.equal(Object.keys(g.state.rodEnchantments.wood).length, 4);
  assert.equal(g.state.xp, 17);
  g.state.rodEnchantments.wood.power = UPGRADES.find(u => u.id === 'power').maxLevel;
  const maxed = structuredClone(g.state);
  assert.equal(g.enchant(target, 'add'), false);
  assert.equal(g.enchant(target, 'book', 'power'), false);
  assert.deepEqual(g.state, maxed);
});

test('buying an enchantment book consumes materials and finite shop stock but does not apply it', () => {
  const g = game();
  g.togglePause();
  const offer = g.state.bookOffers.find(book => book.enchantId === 'power');
  Object.assign(g.state.materials, { wood: 20, stone: 20 });
  const before = structuredClone(g.state.materials);
  assert.equal(g.buyBook('power'), true);
  for (const [key, count] of Object.entries(offer.cost)) assert.equal(g.state.materials[key], before[key] - count);
  assert.equal(offer.stock, 0);
  assert.equal(g.state.books.power, 1);
  assert.deepEqual(g.state.rodEnchantments.wood, {});
  const sold = structuredClone(g.state);
  assert.equal(g.buyBook('power'), false);
  assert.equal(g.buyBook('invented'), false);
  assert.deepEqual(g.state, sold);
  g.state.stations.anvil = true;
  g.state.xp = 3;
  assert.equal(g.enchant({ kind: 'rod', id: 'wood' }, 'book', 'power'), true);
  assert.equal(g.state.books.power, 0);
  assert.equal(g.state.xp, 0);
  assert.equal(g.state.rodEnchantments.wood.power, 1);
});

test('defeated enemies leave XP orbs that grant currency exactly once when a block reaches them', () => {
  const g = game(), events = [];
  g.onEvent = event => events.push(event);
  const zombie = g._spawnEnemy('zombie', { x: 200, y: 150, hp: 1, speed: 0 });
  g._damage(zombie, 10, '#fff');
  assert.equal(g.state.xp, 0);
  assert.equal(g.state.totalXp, 0);
  assert.equal(g.state.experienceOrbs.length, 1);
  const orb = { ...g.state.experienceOrbs[0] };
  g.update(.01);
  assert.equal(g.state.xp, 0, 'distant XP is not collected merely by advancing the game');
  Object.assign(g.state.balls[0], { x: orb.x, y: orb.y, vx: 0, vy: 0 });
  g.state.balls.push(g._newBall('iron', orb.x, orb.y));
  g.update(.01);
  assert.equal(g.state.xp, orb.value);
  assert.equal(g.state.totalXp, orb.value);
  assert.equal(g.state.experienceOrbs.length, 0);
  assert.equal(events.filter(e => e.type === 'xp').length, 1);
  g.update(.01);
  assert.equal(g.state.xp, orb.value);
});

test('paused play and captured blocks cannot collect XP until the block is released', () => {
  const g = game(), ball = g.state.balls[0];
  const holder = g._spawnEnemy('enderman', { x: 180, y: 150, speed: 0 });
  Object.assign(ball, { x: 145, y: 150 });
  g.update(.01);
  assert.equal(ball.heldBy, holder.id);
  g.state.experienceOrbs.push({ id: 1000, x: ball.x, y: ball.y, r: 5, value: 3 });
  g.togglePause();
  const frozen = structuredClone(g.state);
  g.update(1);
  assert.deepEqual(g.state, frozen);
  g.togglePause();
  g.update(.01);
  assert.equal(g.state.xp, 0);
  assert.equal(g.state.experienceOrbs.length, 1);
  for (let click = 0; click < 7; click++) assert.equal(g.clickQte(holder.id), true);
  g.update(.01);
  assert.equal(g.state.xp, 3);
  assert.equal(g.state.experienceOrbs.length, 0);
});

test('collision damage combines only the fired rod and struck block, ignoring other equipment', () => {
  function damage(enchant) {
    const g = game(), cue = g.state.balls[0];
    g.state.resources = [];
    g.state.ownedRods.push('bone');
    g.state.rodEnchantments.bone = { power: 5 };
    const other = g._newBall('iron', 800, 600); other.enchantments = { power: 5 }; g.state.balls.push(other);
    if (enchant) { g.state.rodEnchantments.wood = { power: 1 }; cue.enchantments = { power: 2 }; }
    Object.assign(cue, { x: 120, y: 150 });
    const target = enemy(1000, 175, 150, { hp: 1000, maxHp: 1000 }); g.state.enemies.push(target);
    assert.equal(g.shoot(0, 1, cue.id), true);
    g.update(.05);
    return 1000 - target.hp;
  }
  const plain = damage(false), enchanted = damage(true);
  assert.ok(plain > 0);
  assert.ok(Math.abs(enchanted / plain - (1 + 3 * .24)) < 1e-9);
});

test('switching or enchanting a rod after firing does not change a ball already in flight', () => {
  function impact(changeEquipment) {
    const g = game(), cue = g.state.balls[0];
    g.state.resources = [];
    g.state.ownedRods.push('blaze');
    g.state.rodEnchantments.wood = { power: 1 };
    g.state.rodEnchantments.blaze = { power: 5 };
    Object.assign(cue, { x: 120, y: 150 });
    const target = enemy(1000, 175, 150, { hp: 1000, maxHp: 1000 });
    const nearby = enemy(1001, 190, 225, { hp: 1000, maxHp: 1000 });
    g.state.enemies.push(target, nearby);
    assert.equal(g.shoot(0, 1), true);
    if (changeEquipment) {
      assert.equal(g.equipRod('blaze'), true);
      g.state.stations.anvil = true; g.state.books.power = 1; g.state.xp = 3;
      assert.equal(g.enchant({ kind: 'rod', id: 'wood' }, 'book', 'power'), true);
      assert.equal(g.state.rodEnchantments.wood.power, 2);
    }
    assert.equal(cue.shotRod, 'wood');
    assert.deepEqual(cue.shotEnchantments, { power: 1 });
    g.update(.05);
    assert.equal(nearby.hp, 1000, 'switching to blaze must not add explosions to an earlier wood shot');
    return 1000 - target.hp;
  }
  assert.equal(impact(true), impact(false));
});

test('ghost volleys preserve independent snapshots and the next shot uses the newly equipped rod', () => {
  const g = game();
  g.state.ownedRods.push('end', 'bone');
  g.state.rodEnchantments.end = { power: 2, echo: 1 };
  g.state.rodEnchantments.bone = { power: 4 };
  assert.equal(g.equipRod('end'), true);
  assert.equal(g.shoot(0, 1), true);
  const ghost = g.state.balls.find(b => b.type === 'ghost');
  assert.ok(ghost);
  assert.equal(ghost.shotRod, 'end');
  assert.deepEqual(ghost.shotEnchantments, { power: 2, echo: 1 });
  assert.equal(g.equipRod('bone'), true);
  g.beginAim(g.state.balls[0].id); g.advanceAim(.5);
  assert.equal(g.shoot(Math.PI / 2, 1), true);
  assert.equal(g.state.balls[0].shotRod, 'bone');
  assert.deepEqual(g.state.balls[0].shotEnchantments, { power: 4 });
  assert.equal(ghost.shotRod, 'end');
  assert.deepEqual(ghost.shotEnchantments, { power: 2, echo: 1 });
  assert.equal(g.state.balls.filter(b => b.type === 'ghost').length, 1);
});

function forge(g, id) {
  const recipe = RECIPES.find(r => r.id === id);
  for (const [key, amount] of Object.entries(recipe.cost)) g.state.materials[key] = Math.max(g.state.materials[key] || 0, amount);
  assert.equal(g.craft(id), true);
  return g.state.balls.at(-1);
}

test('late-game groups are substantially denser than opening waves', () => {
  const counts = [];
  for (const elapsed of [0, 270]) {
    const g = game();
    g.state.elapsed = elapsed;
    g.state.stageElapsed = elapsed;
    g.state.stageWave = 1 + Math.floor(elapsed / 30);
    g._lastStageWave = g.state.stageWave;
    g.state.bossesSpawned = ['wither', 'dragon', 'warden'];
    g.state.resources = [];
    // The late window starts between established waves rather than at a new-run delay.
    if (elapsed > 0) g._spawnTimer = getSpawnProfile(elapsed).interval;
    g.update(10.001);
    counts.push(g.state.enemies.length);
    assert.equal(g.state.hp, 120);
  }
  assert.equal(counts[0], 3);
  assert.equal(counts[1], 40);
  assert.ok(counts[1] > counts[0] * 3);
  assert.ok(getSpawnProfile(275).eliteChance <= 0.25);
  assert.equal(getSpawnProfile(0).count, 1);
  assert.equal(getSpawnProfile(275).count, 5);
});

test('the opening gives a two-second grace period and only ten ordinary zombies in thirty seconds', () => {
  const g = game();
  const spawned = [];
  const spawnEnemy = g._spawnEnemy.bind(g);
  g._spawnEnemy = (kind, extra) => {
    const created = spawnEnemy(kind, extra);
    if (created) spawned.push(created.kind);
    return created;
  };
  g.update(1.99);
  assert.equal(spawned.length, 0);
  g.update(28);
  assert.equal(spawned.length, 10);
  assert.ok(spawned.every(kind => kind === 'zombie'));
  assert.equal(getSpawnProfile(35).eliteChance, 0);
  assert.equal(getSpawnProfile(50).eliteChance, 0.1);
  assert.equal(getSpawnProfile(80).eliteChance, 0.15);
  assert.equal(g.state.duration, null);
});

test('the enemy cap never evicts existing bosses or the active QTE holder', () => {
  const g = game();
  const holder = g._spawnEnemy('enderman');
  const wither = g._spawnEnemy('wither');
  const dragon = g._spawnEnemy('dragon');
  g.state.qte = { enemyId: holder.id, ballId: g.state.balls[0].id, remainingClicks: 7 };
  g.state.balls[0].heldBy = holder.id;
  for (let i = 0; i < 117; i += 1) g._spawnEnemy('zombie');
  assert.equal(g.state.enemies.length, 120);
  assert.equal(g._spawnEnemy('zombie'), null);
  const warden = g._spawnEnemy('warden');
  assert.ok(warden);
  assert.equal(g.state.enemies.length, 120);
  for (const protectedEnemy of [holder, wither, dragon, warden]) assert.ok(g.state.enemies.includes(protectedEnemy));
  assert.equal(g.state.qte.enemyId, holder.id);
  assert.equal(g.state.balls[0].heldBy, holder.id);
});

test('fusion preserves the cue identity, consumes one real block, and keeps placement and recall valid', () => {
  const g = game();
  g.state.stations.anvil = true;
  const cue = g.state.balls[0];
  const iron = forge(g, 'iron_block');
  Object.assign(cue, { x: 500, y: 360, vx: 500, vy: 900, fireTimer: 2 });
  iron.fireTimer = 7;
  const materials = structuredClone(g.state.materials);
  assert.equal(g.fuseBlocks(iron.id, cue.id), true);
  assert.equal(g.state.balls.length, 1);
  assert.equal(g.state.balls[0], cue);
  assert.equal(cue.type, 'cue');
  assert.equal(cue.vx, 0); assert.equal(cue.vy, 0);
  assert.equal(cue.fireTimer, 7);
  assert.deepEqual(cue.traits, ['iron']);
  assert.equal(cue.fusionLevel, 1);
  assert.ok(cue.mass > 3);
  assert.ok(cue.r <= 22);
  assert.ok(Math.hypot(cue.x - 500, cue.y - 360) >= WORLD.baseRadius + cue.r);
  assert.deepEqual(g.state.materials, materials);
  assert.equal(describeBall(cue).level, 1);
  assert.equal(g.recall(), true);
  assert.equal(cue.x, 500); assert.equal(cue.y, 460);
});

test('three-trait fused blocks perform iron impacts, lightning, and frost together', () => {
  const events = [];
  const g = new Game({ random: () => 0.55, onEvent: e => events.push(e) }); g.start();
  g.state.stations.anvil = true;
  const cue = g.state.balls[0];
  for (const id of ['iron_block', 'redstone_block', 'frost_block']) {
    const donor = forge(g, id);
    assert.equal(g.fuseBlocks(cue.id, donor.id), true);
  }
  assert.equal(describeBall(cue).name, '三相融合块');
  assert.deepEqual(cue.traits, ['iron', 'storm', 'frost']);
  g.state.resources = [];
  Object.assign(cue, { x: 120, y: 150 });
  const direct = enemy(1000, 175, 150, { hp: 1000, maxHp: 1000 });
  const nearby = enemy(1001, 190, 230, { hp: 1000, maxHp: 1000 });
  g.state.enemies.push(direct, nearby);
  g.shoot(0, 1, cue.id); g.update(0.05);
  assert.ok(direct.hp < 900, 'the iron/fusion impact and elemental damage combine');
  assert.ok(nearby.hp < 1000);
  assert.ok(nearby.slowTimer > 0);
  assert.ok(events.some(e => e.type === 'lightning'));
  const extra = forge(g, 'iron_block');
  const before = structuredClone(g.state.balls);
  assert.equal(g.fuseBlocks(cue.id, extra.id), false);
  assert.deepEqual(g.state.balls, before, 'a level-three block cannot consume more material blocks');
});

test('fusion validates stations, held/ghost/missing targets and merges enchantments without losing excess entries', () => {
  const g = game();
  const cue = g.state.balls[0];
  const iron = forge(g, 'iron_block');
  assert.equal(g.canFuse(cue.id, iron.id).ok, false);
  g.state.stations.anvil = true;
  assert.equal(g.canFuse(cue.id, cue.id).ok, false);
  assert.equal(g.canFuse(cue.id, -1).ok, false);
  iron.heldBy = 123;
  assert.equal(g.fuseBlocks(cue.id, iron.id), false);
  delete iron.heldBy;
  const ghost = { id: 999, type: 'ghost', x: 80, y: 80, r: 8, mass: 0.5, vx: 0, vy: 0, charge: 0, life: 2 };
  g.state.balls.push(ghost);
  assert.equal(g.fuseBlocks(cue.id, ghost.id), false);
  cue.enchantments = { power: 1, crit: 1 };
  iron.enchantments = { power: 3, frost_touch: 1, steam_burst: 1 };
  assert.equal(g.fuseBlocks(cue.id, iron.id), true);
  assert.deepEqual(cue.enchantments, { power: 3, crit: 1, frost_touch: 1, steam_burst: 1 });
  const frost = forge(g, 'frost_block');
  frost.enchantments = { storm_link: 1 };
  const before = structuredClone(g.state.balls);
  assert.equal(g.fuseBlocks(cue.id, frost.id), false);
  assert.deepEqual(g.state.balls, before);
  g.state.phase = 'won';
  assert.equal(g.canFuse(cue.id, frost.id).ok, false);
});

test('repeated forging supplies fusion donors, respects capacity, and upgrades still affect fused traits', () => {
  const g = game();
  g.state.stations.anvil = true;
  const cue = g.state.balls[0];
  const first = forge(g, 'iron_block');
  assert.equal(g.fuseBlocks(cue.id, first.id), true);
  const mass = cue.mass;
  upgrade(g, 'iron');
  assert.ok(cue.mass > mass);
  assert.ok(g.state.balls.some(b => b.type === 'iron' && b.fusionLevel === 0));
  while (g.state.balls.length < 18) forge(g, 'iron_block');
  for (const [key, value] of Object.entries(RECIPES.find(r => r.id === 'frost_block').cost)) g.state.materials[key] = value;
  const inventory = structuredClone(g.state.materials);
  assert.equal(g.craft('frost_block'), false);
  assert.deepEqual(g.state.materials, inventory);
  const donors = g.state.balls.filter(b => b.type === 'iron' && !b.fusionLevel);
  assert.equal(g.fuseBlocks(donors[0].id, donors[1].id), true);
  assert.equal(g.craft('frost_block'), true);
  assert.equal(g.state.balls.length, 18);
  assert.equal(new Set(g.state.balls.map(b => b.id)).size, 18);
});

test('rod unlocks persist across switching and prerequisites depend on ownership instead of the equipped rod', () => {
  const g = game();
  upgrade(g, 'rod'); upgrade(g, 'rod');
  assert.equal(g.equipRod('wood'), true);
  upgrade(g, 'rod');
  assert.deepEqual(g.state.ownedRods, ['wood', 'bone', 'end', 'blaze']);
  assert.equal(g.state.activeRod, 'blaze');
  assert.equal(g.state.upgrades.rod, 3);
  assert.equal(g.equipRod('bone'), true);
  assert.equal(g.state.upgrades.rod, 3);
  assert.equal(g.canCraft('end_rod').ok, false);
  assert.equal(g.equipRod('missing'), false);
  assert.equal(RODS.length, 4);
  const wood = game(); wood.shoot(0, 1); wood.beginAim(); wood.advanceAim(0.24);
  assert.equal(wood.shoot(0, 1), true);
  const bone = game(); upgrade(bone, 'rod'); bone.shoot(0, 1); bone.beginAim(); bone.advanceAim(0.24);
  assert.equal(bone.shoot(0, 1), false, 'the wood rod retains a distinct quick-shot advantage');
});

test('a snowball enables chain lightning on an otherwise non-elemental block', () => {
  const events = [];
  const g = new Game({ random: () => 0.55, onEvent: e => events.push(e) }); g.start();
  const cue = g.state.balls[0]; cue.enchantments.storm_link = 1;
  Object.assign(cue, { x: 120, y: 150 });
  g.state.enemies.push(enemy(1000, 175, 150, { hp: 1000, maxHp: 1000 }), enemy(1001, 190, 230, { hp: 1000, maxHp: 1000 }));
  g.state.items.snowball = 1;
  assert.equal(g.useItem('snowball', 175, 150), true);
  g.shoot(0, 1); g.update(0.05);
  assert.ok(events.some(e => e.type === 'lightning'));
  assert.ok(g.state.enemies[1].hp < 1000);
  assert.equal(g.state.items.snowball, 0);
});

test('fire charges ignite frost-lightning fusion and enable a bounded steam burst', () => {
  const events = [];
  const g = new Game({ random: () => 0.55, onEvent: e => events.push(e) }); g.start();
  g.state.stations.anvil = true;
  const cue = g.state.balls[0];
  for (const id of ['redstone_block', 'frost_block']) g.fuseBlocks(cue.id, forge(g, id).id);
  cue.enchantments.steam_burst = 1;
  Object.assign(cue, { x: 120, y: 150 });
  const target = enemy(1000, 175, 150, { hp: 1000, maxHp: 1000, slowTimer: 3 });
  g.state.enemies.push(target, enemy(1001, 190, 230, { hp: 1000, maxHp: 1000 }));
  g.state.items.fire_charge = 1;
  assert.equal(g.useItem('fire_charge', 120, 150), true);
  g.shoot(0, 1); g.update(0.05);
  assert.ok(cue.fireTimer > 5);
  assert.equal(events.filter(e => e.source === 'steam').length, 1);
  assert.ok(target.slowTimer > 0, 'steam preserves the existing frost and slow effects');
  assert.ok(events.some(e => e.type === 'lightning'));
  assert.deepEqual(cue.traits, ['storm', 'frost']);
});

test('looting materials can directly complete a rod recipe', () => {
  const g = new Game({ random: () => 0.1 }); g.start();
  g.state.rodEnchantments.wood.looting = 1;
  Object.assign(g.state.balls[0], { x: 120, y: 150 });
  g._spawnEnemy('skeleton', { x: 175, y: 150, hp: 1, speed: 0 });
  g.shoot(0, 1); g.update(0.05);
  assert.equal(g.state.materials.bone, 3);
  assert.equal(g.canCraft('bone_rod').ok, true);
  assert.equal(g.craft('bone_rod'), true);
  assert.equal(g.state.materials.bone, 0);
});

test('recall bursts scale with previous combo and charge, consume charge, and respect recall cooldown', () => {
  const g = game();
  g.state.baseEnchantments.recall_burst = 1;
  g.state.combo = 8;
  g.state.balls[0].charge = 1;
  const target = enemy(1000, 580, 360, { hp: 1000, maxHp: 1000 }); g.state.enemies.push(target);
  assert.equal(g.recall(), true);
  assert.equal(target.hp, 942);
  assert.equal(g.state.balls[0].charge, 0);
  assert.equal(g.recall(), false);
  assert.equal(target.hp, 942);
});

test('overcharge freezes while paused and shortens both shot and elemental cooldowns', () => {
  const g = game(); g.state.items.redstone_boost = 1; g.togglePause();
  assert.equal(g.useItem('redstone_boost'), true);
  g.update(5);
  assert.equal(g.state.overchargeTimer, 10);
  g.togglePause(); g.shoot(0, 1); g.beginAim(); g.advanceAim(0.16);
  assert.equal(g.shoot(0, 1), true);
  g.update(1);
  assert.ok(g.state.overchargeTimer > 8.94 && g.state.overchargeTimer < 8.96);
  for (const overloaded of [false, true]) {
    const events = [];
    const trial = new Game({ random: () => 0.55, onEvent: e => events.push(e) }); trial.start();
    const ball = forge(trial, 'redstone_block'); Object.assign(ball, { x: 120, y: 150, vx: 0, vy: 0 });
    trial.state.enemies.push(enemy(1000, 190, 230, { hp: 1000, maxHp: 1000 }));
    if (overloaded) trial.state.overchargeTimer = 10;
    trial._element(ball, 20); trial.update(0.3); trial._element(ball, 20);
    assert.equal(events.filter(e => e.type === 'lightning').length, overloaded ? 2 : 1);
  }
});

test('ender pearls reject captured targets without spending inventory and place free blocks legally', () => {
  const g = game(); const cue = g.state.balls[0]; g.state.items.ender_pearl = 1;
  cue.heldBy = 77;
  assert.equal(g.useItem('ender_pearl', 500, 360, cue.id), false);
  assert.equal(g.state.items.ender_pearl, 1);
  assert.equal(g.useItem('ender_pearl', NaN, 360, cue.id), false);
  delete cue.heldBy;
  assert.equal(g.useItem('ender_pearl', 500, 360, cue.id), true);
  assert.equal(g.state.items.ender_pearl, 0);
  assert.ok(Math.hypot(cue.x - 500, cue.y - 360) >= WORLD.baseRadius + cue.r);
  assert.equal(cue.vx, 0); assert.equal(cue.vy, 0);
});

test('knockback, enemy chains, dragon charges, edge splits and teleports keep complete enemy circles inside the arena', () => {
  const assertInside = g => {
    for (const e of g.state.enemies.filter(e => e.hp > 0)) {
      assert.ok([e.x, e.y, e.vx, e.vy].every(Number.isFinite));
      assert.ok(e.x - e.r >= WORLD.margin - 1e-8 && e.x + e.r <= WORLD.width - WORLD.margin + 1e-8);
      assert.ok(e.y - e.r >= WORLD.margin - 1e-8 && e.y + e.r <= WORLD.height - WORLD.margin + 1e-8);
    }
  };
  const knocked = game();
  knocked.state.upgrades.knockback = 4;
  Object.assign(knocked.state.balls[0], { x: 890, y: 180, vx: 1250, vy: 0, mass: 6 });
  knocked._spawnEnemy('zombie', { x: 925, y: 180, hp: 1000, speed: 0 });
  knocked.update(0.4); assertInside(knocked);
  const chained = game();
  chained._spawnEnemy('zombie', { x: 900, y: 200, hp: 1000, speed: 0, vx: 650, chainLeft: 3 });
  chained._spawnEnemy('zombie', { x: 930, y: 200, hp: 1000, speed: 0 });
  chained.update(0.2); assertInside(chained);
  const charged = game();
  charged._spawnEnemy('dragon', { x: 925, y: 650, vx: 1200, vy: 1200, speed: 0, attackCooldown: 0 });
  charged.update(0.2); assertInside(charged);
  const split = game(); const slime = split._spawnEnemy('slime', { x: 970, y: 690, size: 3 });
  split._damage(slime, 1000, '#fff'); assertInside(split);
  split.update(0.1); assertInside(split);
  const teleported = game();
  const enderman = teleported._spawnEnemy('enderman', { x: 930, y: 650, speed: 0 });
  Object.assign(teleported.state.balls[0], { x: 800, y: 650, vx: 700, vy: 0 });
  teleported.update(0.01); assertInside(teleported);
  assert.ok(enderman.teleportCooldown > 5);
});

test('experience orbs merge at their cap without losing any currency and remain collectable outside the base', () => {
  const g = game();
  for (let i = 0; i < 200; i += 1) g._dropExperience(500, 360, 1);
  assert.equal(g.state.experienceOrbs.length, 160);
  assert.equal(g.state.experienceOrbs.reduce((sum, orb) => sum + orb.value, 0), 200);
  assert.ok(g.state.experienceOrbs.every(orb => Math.hypot(orb.x - 500, orb.y - 360) >= WORLD.baseRadius));
});

test('TNT blocks collect XP and accept ball enchantments but cannot be fused or detonated through inventory APIs', () => {
  const g = game(); const tnt = forge(g, 'tnt');
  assert.equal(describeBall(tnt).name, 'TNT方块');
  assert.ok(describeBall(tnt).description.includes('红石碰撞引爆'));
  g.state.stations.anvil = true;
  assert.equal(g.canFuse(g.state.balls[0].id, tnt.id).ok, false);
  assert.equal(g.describeEnchantTarget({ kind: 'ball', id: tnt.id }).ok, true);
  g.state.xp = 3; g.state.books.power = 1;
  assert.equal(g.enchant({ kind: 'ball', id: tnt.id }, 'book', 'power'), true);
  assert.equal(tnt.enchantments.power, 1);
  g._dropExperience(tnt.x, tnt.y, 5); g.update(0.01);
  assert.equal(g.state.xp, 5);
  g.state.items.tnt = 99;
  assert.equal(g.useTnt(tnt.x, tnt.y), false);
  assert.equal(g.useItem('tnt', tnt.x, tnt.y), false);
  assert.equal(tnt.detonated, undefined);
});

test('native and fused redstone impacts each consume TNT exactly once while preserving the triggering block', () => {
  for (const fused of [false, true]) {
    const events = [];
    const g = new Game({ random: () => 0.55, onEvent: event => events.push(event) }); g.start();
    const tnt = forge(g, 'tnt');
    let redstone = forge(g, 'redstone_block');
    if (fused) {
      g.state.stations.anvil = true;
      const cue = g.state.balls.find(b => b.type === 'cue');
      assert.equal(g.fuseBlocks(cue.id, redstone.id), true);
      redstone = cue;
    }
    g.state.resources = [];
    Object.assign(tnt, { x: 210, y: 150, vx: 0, vy: 0 });
    Object.assign(redstone, { x: 150, y: 150, vx: 0, vy: 0 });
    const target = g._spawnEnemy('zombie', { x: 260, y: 150, hp: 1000, maxHp: 1000, speed: 0 });
    assert.equal(g.shoot(0, 1, redstone.id), true);
    g.update(0.1);
    assert.equal(tnt.detonated, true);
    assert.ok(!g.state.balls.includes(tnt));
    assert.ok(g.state.balls.includes(redstone));
    assert.ok(target.hp < 1000);
    g._ballPair(tnt, redstone); g.update(0.1);
    assert.equal(events.filter(e => e.type === 'pulse' && e.source === 'tnt').length, 1);
  }
});

test('stationary or weak redstone contact, ordinary blocks, fire, walls and the base cannot detonate TNT', () => {
  for (const scenario of ['static', 'weak', 'ordinary', 'fire', 'wall', 'base']) {
    const events = [];
    const g = new Game({ random: () => 0.55, onEvent: event => events.push(event) }); g.start();
    const tnt = forge(g, 'tnt'); g.state.resources = [];
    Object.assign(tnt, { x: 210, y: 150, vx: 0, vy: 0 });
    if (scenario === 'static' || scenario === 'weak') {
      const redstone = forge(g, 'redstone_block');
      Object.assign(redstone, { x: 184, y: 150, vx: scenario === 'weak' ? 70 : 0, vy: 0 });
    } else if (scenario === 'ordinary') {
      Object.assign(g.state.balls[0], { x: 150, y: 150, vx: 900, vy: 0 });
    } else if (scenario === 'fire') {
      tnt.fireTimer = 5;
      g._spawnEnemy('zombie', { x: 270, y: 150, hp: 1000, speed: 0 });
      g.shoot(0, 1, tnt.id);
    } else if (scenario === 'wall') {
      Object.assign(tnt, { x: 950, y: 150, vx: 700, vy: 0 });
    } else {
      Object.assign(tnt, { x: 500, y: 450, vx: 0, vy: -700 });
      Object.assign(g.state.balls[0], { x: 100, y: 600 });
    }
    g.update(0.12);
    assert.ok(g.state.balls.includes(tnt), scenario);
    assert.ok(!tnt.detonated, scenario);
    assert.equal(events.filter(e => e.source === 'tnt').length, 0, scenario);
  }
});

test('redstone-triggered TNT gathers wood, damages resistant ore, and protects the base and allies including creeper chains', () => {
  const g = game(); const tnt = forge(g, 'tnt'); const redstone = forge(g, 'redstone_block');
  g.state.resources = [];
  Object.assign(tnt, { x: 600, y: 360, vx: 0, vy: 0 });
  Object.assign(redstone, { x: 660, y: 360, vx: 0, vy: 0 });
  g._spawnResource('tree', 700, 400);
  g._spawnResource('ore', 690, 260);
  g._spawnEnemy('creeper', { x: 600, y: 420, speed: 0 });
  const ally = { id: 9000, kind: 'snow_golem', x: 640, y: 300, r: 15, hp: 65, maxHp: 65, attackCooldown: 100, vx: 0, vy: 0 };
  g.state.allies.push(ally);
  const before = structuredClone(g.state.materials);
  g.shoot(Math.PI, 1, redstone.id); g.update(0.1);
  assert.equal(tnt.detonated, true);
  assert.equal(g.state.hp, 120);
  assert.equal(ally.hp, 65);
  assert.equal(g.state.materials.wood, before.wood + 3);
  assert.equal(g.state.materials.stone, before.stone);
  assert.equal(g.state.materials.iron, before.iron);
  assert.equal(g.state.resources.length, 1);
  assert.equal(g.state.resources[0].material, 'iron');
  assert.ok(g.state.resources[0].hp > 0 && g.state.resources[0].hp < g.state.resources[0].maxHp);
});

test('a captured TNT block cannot be fired or armed by a passing redstone block', () => {
  const events = [];
  const g = new Game({ random: () => 0.55, onEvent: event => events.push(event) }); g.start();
  const tnt = forge(g, 'tnt'); const redstone = forge(g, 'redstone_block');
  Object.assign(tnt, { x: 210, y: 150, vx: 0, vy: 0 });
  Object.assign(redstone, { x: 150, y: 150, vx: 700, vy: 0 });
  const enderman = g._spawnEnemy('enderman', { x: 210, y: 200, speed: 0 });
  g.update(0.1);
  assert.equal(tnt.heldBy, enderman.id);
  assert.equal(g.state.qte.ballId, tnt.id);
  assert.equal(g.shoot(0, 1, tnt.id), false);
  assert.equal(g.useTnt(tnt.x, tnt.y), false);
  assert.ok(g.state.balls.includes(tnt));
  assert.equal(events.filter(e => e.source === 'tnt').length, 0);
});

test('repeat TNT forging respects the eighteen-block cap and failed crafting spends no materials', () => {
  const g = game();
  while (g.state.balls.length < 18) forge(g, 'tnt');
  g.state.materials.gunpowder = 3; g.state.materials.wood = 1;
  const before = structuredClone(g.state.materials);
  assert.equal(g.canCraft('tnt').ok, false);
  assert.equal(g.craft('tnt'), false);
  assert.deepEqual(g.state.materials, before);
  assert.equal(g.state.balls.length, 18);
  assert.equal(g.state.balls.filter(b => b.type === 'tnt').length, 17);
});

test('several orbs collected in one microstep queue every level reward and never mutate equipment enchantments', () => {
  const g = game(); const cue = g.state.balls[0];
  g.state.rodEnchantments.wood = { fire_aspect: 1, power: 1 };
  cue.enchantments = { steam_burst: 1 };
  g.state.baseEnchantments = { regen: 1 };
  const gear = structuredClone({ rods: g.state.rodEnchantments, ball: cue.enchantments, base: g.state.baseEnchantments });
  const materials = structuredClone(g.state.materials);
  for (const value of [4, 10, 14]) g._dropExperience(cue.x, cue.y, value);
  g.update(0.1);
  assert.equal(g.state.experienceOrbs.length, 0);
  assert.equal(g.state.level, 4);
  assert.equal(g.state.pendingUpgrades, 3);
  assert.equal(g.state.levelXp, 0);
  assert.equal(g.state.xpNext, 19);
  const allowed = new Set(['power', 'charge', 'knockback', 'crit', 'echo', 'ricochet', 'iron', 'storm', 'frost', 'slime', 'fire_aspect', 'frost_touch', 'stationary_turret', 'earthshatter', 'prism', 'gravity_mark']);
  while (g.state.pendingUpgrades > 0) {
    assert.equal(g.state.phase, 'upgrade');
    assert.ok(g.state.choices.every(id => allowed.has(id)));
    assert.equal(new Set(g.state.choices).size, g.state.choices.length);
    assert.equal(g.chooseUpgrade(g.state.choices[0]), true);
  }
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.state.xp, 28);
  assert.equal(g.state.totalXp, 28);
  assert.deepEqual({ rods: g.state.rodEnchantments, ball: cue.enchantments, base: g.state.baseEnchantments }, gear);
  assert.deepEqual(g.state.ownedRods, ['wood']);
  assert.deepEqual(g.state.stations, { enchantingTable: false, anvil: false });
  assert.deepEqual(g.state.materials, materials);
});

test('free reward selection and workbench spending have independent balances and level progress', () => {
  const g = game(); const cue = g.state.balls[0];
  g._dropExperience(cue.x, cue.y, 50); g.update(0.01);
  while (g.state.pendingUpgrades > 0) g.chooseUpgrade(g.state.choices[0]);
  const earned = { totalXp: g.state.totalXp, level: g.state.level, levelXp: g.state.levelXp, xpNext: g.state.xpNext, pending: g.state.pendingUpgrades };
  g.state.stations.enchantingTable = true;
  assert.equal(g.enchant({ kind: 'rod', id: 'wood' }, 'random'), true);
  assert.equal(g.state.xp, 42);
  assert.deepEqual({ totalXp: g.state.totalXp, level: g.state.level, levelXp: g.state.levelXp, xpNext: g.state.xpNext, pending: g.state.pendingUpgrades }, earned);
  g._dropExperience(cue.x, cue.y, 1); g.update(0.01);
  assert.equal(g.state.xp, 43);
  assert.equal(g.state.totalXp, 51);
  assert.equal(g.state.levelXp, 4);
  assert.equal(g.state.pendingUpgrades, 0);
});

test('upgrade screens freeze the world and forged, forbidden or maxed selections never consume rewards', () => {
  const forged = game(); forged.state.phase = 'upgrade'; forged.state.choices = ['power'];
  assert.equal(forged.chooseUpgrade('power'), false);
  forged.state.pendingUpgrades = 1;
  assert.equal(forged.chooseUpgrade('power'), false, 'editing public choices cannot fabricate an actual offer');
  const g = game(); const cue = g.state.balls[0];
  g._dropExperience(cue.x, cue.y, 5); g.update(0.01);
  const before = structuredClone(g.state);
  g.update(10); g.advanceAim(10);
  assert.equal(g.shoot(0, 1), false);
  assert.equal(g.recall(), false);
  assert.equal(g.togglePause(), false);
  assert.equal(g.craft('frost_block'), false);
  assert.equal(g.chooseUpgrade('fire_aspect'), false);
  assert.equal(g.chooseUpgrade('rod'), false);
  assert.equal(g.chooseUpgrade('invented'), false);
  assert.deepEqual(g.state, before);
  const id = g.state.choices[0];
  g.state.upgrades[id] = UPGRADES.find(u => u.id === id).maxLevel;
  assert.equal(g.chooseUpgrade(id), false);
  assert.equal(g.state.pendingUpgrades, 1);
  assert.equal(g.state.xp, 5);
});

test('full block capacity hides new native blocks but permits upgrading a present standalone type', () => {
  const full = game();
  while (full.state.balls.length < 18) forge(full, 'tnt');
  full._dropExperience(full.state.balls[0].x, full.state.balls[0].y, 5); full.update(0.01);
  assert.ok(full.state.choices.every(id => !['iron', 'storm', 'frost'].includes(id)));
  assert.equal(full.chooseUpgrade('iron'), false);
  const g = game(); const iron = forge(g, 'iron_block');
  for (const ball of g.state.balls) ball.enchantments = { power: 1, crit: 1, knockback: 1, ricochet: 1 }; // No available turret slots in this native-upgrade fixture.
  while (g.state.balls.length < 18) forge(g, 'tnt');
  const mass = iron.mass;
  g._dropExperience(g.state.balls[0].x, g.state.balls[0].y, 5); g.update(0.01);
  assert.ok(g.state.choices.includes('iron'));
  assert.equal(g.chooseUpgrade('iron'), true);
  assert.equal(g.state.balls.length, 18);
  assert.equal(g.state.upgrades.iron, 2);
  assert.ok(iron.mass > mass);
});

test('native rewards for fused types are offered only when their new standalone block fits and also strengthen the fusion', () => {
  const g = game(); g.state.stations.anvil = true;
  const cue = g.state.balls[0]; const donor = forge(g, 'iron_block');
  g.fuseBlocks(cue.id, donor.id);
  while (g.state.balls.length < 18) forge(g, 'tnt');
  assert.equal(g._isFreeUpgradeAvailable('iron'), false);
  g.state.balls.pop();
  assert.equal(g._isFreeUpgradeAvailable('iron'), true);
  const oldMass = cue.mass;
  g._dropExperience(cue.x, cue.y, 5); g.update(0.01);
  // Make iron the only ball-category candidate without changing the earned reward.
  if (!g.state.choices.includes('iron')) {
    while (g.state.pendingUpgrades) g.chooseUpgrade(g.state.choices[0]);
    g.state.upgrades.storm = 3; g.state.upgrades.frost = 3; g.state.upgrades.slime = 3;
    cue.enchantments = { power: 1, crit: 1, knockback: 1, ricochet: 1 };
    g._dropExperience(cue.x, cue.y, 9); g.update(0.01);
  }
  assert.ok(g.state.choices.includes('iron'));
  assert.equal(g.chooseUpgrade('iron'), true);
  assert.ok(cue.mass > oldMass);
  assert.ok(g.state.balls.some(ball => ball.type === 'iron' && ball.fusionLevel === 0));
  assert.ok(g.state.balls.length <= 18);
});

test('exhausted combat upgrades provide three repeatable supply choices without spending experience', () => {
  const allowed = ['power', 'charge', 'knockback', 'crit', 'echo', 'ricochet', 'iron', 'storm', 'frost', 'slime', 'fire_aspect', 'frost_touch', 'earthshatter', 'prism', 'gravity_mark'];
  const g = game();
  g.state.balls[0].enchantments = { power: 1, crit: 1, knockback: 1, ricochet: 1 };
  for (const id of allowed) g.state.upgrades[id] = UPGRADES.find(u => u.id === id).maxLevel;
  g._dropExperience(g.state.balls[0].x, g.state.balls[0].y, 50); g.update(0.01);
  assert.equal(g.state.phase, 'upgrade');
  assert.equal(g.state.pendingUpgrades, 4);
  assert.deepEqual(new Set(g.state.choices), new Set(['supply_building', 'supply_iron', 'supply_book']));
  assert.equal(g.state.xp, 50);
  assert.equal(g.state.totalXp, 50);
  assert.equal(g.chooseUpgrade('repair'), false);
  const materials = { ...g.state.materials };
  assert.equal(g.chooseUpgrade('supply_building'), true);
  assert.equal(g.state.materials.wood, materials.wood + 5);
  assert.equal(g.state.materials.stone, materials.stone + 5);
  assert.equal(g.chooseUpgrade('supply_iron'), true);
  assert.equal(g.state.materials.iron, materials.iron + 3);
  assert.equal(g.chooseUpgrade('supply_book'), true);
  assert.equal(Object.values(g.state.books).reduce((sum, value) => sum + value, 0), 1);
  assert.equal(g.chooseUpgrade('supply_iron'), true);
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.state.pendingUpgrades, 0);
  assert.equal(g.state.xp, 50);
  assert.equal(g.state.totalXp, 50);
  assert.ok(Object.keys(g.state.upgrades).every(id => !id.startsWith('supply_')));
});

test('victory and defeat in the collection microstep take priority over queued upgrade popups', () => {
  for (const outcome of ['won', 'lost']) {
    const events = [];
    const g = new Game({ random: () => 0.55, onEvent: event => events.push(event) }); g.start();
    if (outcome === 'won') {
      g._changeStage('end'); g._spawnTimer = Infinity;
      for (const crystal of g.state.crystals) g._damageCrystal(crystal, 180);
      const dragon = g.state.enemies.find(e => e.kind === 'dragon');
      Object.assign(dragon, { x: 175, y: 150, hp: 1, speed: 0, attackCooldown: 999 });
      Object.assign(g.state.balls[0], { x: 140, y: 150, vx: 1000, vy: 0 });
    } else {
      g.state.hp = 1;
      const arrow = g._spawnProjectile('enemy', 'arrow', 500, 315, Math.PI / 2, 2, 200);
      assert.ok(arrow);
    }
    g._dropExperience(g.state.balls[0].x, g.state.balls[0].y, 5);
    g.update(0.1);
    assert.equal(g.state.phase, outcome);
    assert.equal(g.state.pendingUpgrades, 0);
    assert.deepEqual(g.state.choices, []);
    assert.equal(events.filter(event => event.type === 'level').length, 0);
  }
});

test('portal building validates realm-specific materials and consumes its cost only once', () => {
  const g = game(); g.togglePause();
  assert.match(g.getObjective(), /0\/10/);
  g.state.materials.obsidian = 9;
  const insufficient = structuredClone(g.state.materials);
  assert.equal(g.buildPortal(), false);
  assert.deepEqual(g.state.materials, insufficient);
  g.state.materials.obsidian = 13;
  assert.deepEqual(g.canBuildPortal().cost, { obsidian: 10 });
  assert.equal(g.buildPortal(), true);
  assert.equal(g.state.materials.obsidian, 3);
  assert.equal(g.state.portal.targetStage, 'nether');
  assert.equal(g.state.portal.riseTimer, 1);
  const spent = structuredClone(g.state.materials);
  assert.equal(g.buildPortal(), false);
  assert.deepEqual(g.state.materials, spent);
  g._changeStage('nether');
  Object.assign(g.state.materials, { endPearl: 12, blazePowder: 11 });
  const shortPowder = structuredClone(g.state.materials);
  assert.equal(g.buildPortal(), false);
  assert.deepEqual(g.state.materials, shortPowder);
  g.state.materials.blazePowder = 12;
  assert.equal(g.buildPortal(), true);
  assert.equal(g.state.materials.endPearl, 0);
  assert.equal(g.state.materials.blazePowder, 0);
  assert.equal(g.state.portal.targetStage, 'return');
});

test('portal rise respects pause and the 2.5-second transition freezes combat and rejects gameplay actions', () => {
  const g = game(); g._spawnTimer = Infinity; g.state.materials.obsidian = 10;
  assert.equal(g.buildPortal(), true);
  assert.equal(g.enterPortal(), false);
  g.togglePause(); g.update(3);
  assert.equal(g.state.portal.riseTimer, 1);
  g.togglePause(); g.update(1.01);
  assert.equal(g.state.portal.riseTimer, 0);
  g._spawnEnemy('zombie', { x: 600, y: 400, speed: 50 });
  Object.assign(g.state.balls[0], { vx: 500, vy: 300 });
  assert.equal(g.enterPortal(), true);
  const frozen = structuredClone({ hp: g.state.hp, balls: g.state.balls, enemies: g.state.enemies, elapsed: g.state.elapsed, stageElapsed: g.state.stageElapsed });
  assert.equal(g.state.phase, 'transition');
  assert.equal(g.shoot(0, 1), false);
  assert.equal(g.equipRod('wood'), false);
  assert.equal(g.craft('potion'), false);
  assert.equal(g.buildPortal(), false);
  assert.equal(g.enterPortal(), false);
  g.update(2.49);
  assert.deepEqual({ hp: g.state.hp, balls: g.state.balls, enemies: g.state.enemies, elapsed: g.state.elapsed, stageElapsed: g.state.stageElapsed }, frozen);
  assert.equal(g.state.stage, 'overworld');
  g.update(.02);
  assert.equal(g.state.stage, 'nether');
  assert.equal(g.state.phase, 'playing');
  assert.equal(g.state.stageElapsed, 0);
  assert.equal(g.state.stageWave, 1);
  assert.equal(g.state.transition, null);
});

test('stage transitions preserve equipment, affixes, currencies, base health and living allies', () => {
  const g = game();
  for (const recipe of RECIPES) for (const material of Object.keys(recipe.cost)) g.state.materials[material] = 100;
  g.craft('bone_rod'); g.craft('anvil'); g.craft('enchanting_table'); g.craft('iron_golem');
  const cue = g.state.balls[0], iron = forge(g, 'iron_block');
  assert.equal(g.fuseBlocks(cue.id, iron.id), true);
  cue.enchantments = { power: 2 };
  g.state.rodEnchantments.bone = { crit: 2 };
  g.state.baseEnchantments = { regen: 1 };
  g.state.items.potion = 2; g.state.books.power = 1; g.state.pickaxe = 'iron';
  g.state.xp = 17; g.state.totalXp = 17; g.state.hp = 83; g.state.allies[0].hp = 71;
  g.state.materials.obsidian = 12;
  assert.equal(g.buildPortal(), true); g.state.portal.riseTimer = 0;
  const before = structuredClone({ materials: g.state.materials, xp: g.state.xp, totalXp: g.state.totalXp, ownedRods: g.state.ownedRods, activeRod: g.state.activeRod, stations: g.state.stations, rodEnchantments: g.state.rodEnchantments, baseEnchantments: g.state.baseEnchantments, items: g.state.items, books: g.state.books, hp: g.state.hp, maxHp: g.state.maxHp, pickaxe: g.state.pickaxe });
  const allyId = g.state.allies[0].id;
  const ghost = g._newBall('ghost', 100, 100); ghost.life = 2; g.state.balls.push(ghost);
  g._spawnProjectile('enemy', 'arrow', 100, 100, 0, 3);
  assert.equal(g.enterPortal(), true); g.update(2.5);
  for (const [key, value] of Object.entries(before)) assert.deepEqual(g.state[key], value, key);
  assert.equal(g.state.balls.length, 1);
  assert.equal(g.state.balls[0].id, cue.id);
  assert.deepEqual(g.state.balls[0].traits, ['iron']);
  assert.equal(g.state.balls[0].fusionLevel, 1);
  assert.deepEqual(g.state.balls[0].enchantments, { power: 2 });
  assert.equal(g.state.balls[0].vx, 0);
  assert.equal(g.state.allies[0].id, allyId);
  assert.equal(g.state.allies[0].hp, 71);
  assert.equal(g.state.projectiles.length, 0);
  assert.equal(g.state.portal, null);
  assert.ok(g.state.resources.some(resource => resource.material === 'quartz'));
});

test('the full expedition follows both material gates and three return waves before raising the End gate', () => {
  const g = game(), transitions = [];
  g.onEvent = event => { if (event.type === 'stageChange') transitions.push([event.from, event.to]); };
  g.state.materials.obsidian = 10; g._spawnTimer = Infinity;
  assert.equal(g.buildPortal(), true); g.update(1.01); assert.equal(g.enterPortal(), true); g.update(2.5);
  assert.equal(g.state.stage, 'nether');
  g._spawnTimer = Infinity; Object.assign(g.state.materials, { endPearl: 12, blazePowder: 12 });
  assert.equal(g.buildPortal(), true); g.update(1.01); assert.equal(g.enterPortal(), true); g.update(2.5);
  assert.equal(g.state.stage, 'return');
  assert.equal(g.canBuildPortal().ok, false);
  g._spawnTimer = Infinity; g.update(89.99);
  assert.equal(g.state.portal, null);
  assert.match(g.getObjective(), /2\/3/);
  g.update(.02);
  assert.equal(g.state.portal.targetStage, 'end');
  assert.ok(g.state.portal.riseTimer > 1.98);
  assert.equal(g.enterPortal(), false);
  g.update(2.01); assert.equal(g.enterPortal(), true); g.update(2.5);
  assert.equal(g.state.stage, 'end');
  assert.equal(g.state.crystals.length, 4);
  assert.equal(g.state.phase, 'playing');
  assert.deepEqual(transitions, [['overworld', 'nether'], ['nether', 'return'], ['return', 'end']]);
});

test('End crystals absorb 80 shield damage before 100 health and summon exactly one dragon after all four break', () => {
  const g = game(), events = []; g.onEvent = event => events.push(event);
  g._changeStage('end'); g._spawnTimer = Infinity;
  assert.equal(g.state.crystals.length, 4);
  assert.ok(g.state.crystals.every(crystal => crystal.shield === 80 && crystal.hp === 100));
  const first = g.state.crystals[0];
  g._damageCrystal(first, 79); assert.equal(first.shield, 1); assert.equal(first.hp, 100);
  g._damageCrystal(first, 1); assert.equal(first.shield, 0); assert.equal(first.hp, 100);
  g._damageCrystal(first, 99); assert.equal(first.hp, 1);
  g._damageCrystal(first, 1); assert.equal(first.hp, 0);
  assert.ok(!g.state.enemies.some(enemy => enemy.kind === 'dragon'));
  for (const crystal of g.state.crystals.slice(1)) g._damageCrystal(crystal, 180);
  g._damageCrystal(first, 1000); g.update(.02);
  assert.equal(g.state.enemies.filter(enemy => enemy.kind === 'dragon').length, 1);
  assert.equal(events.filter(event => event.type === 'crystalBreak').length, 4);
  assert.equal(events.filter(event => event.type === 'bossIntro' && event.kind === 'dragon').length, 1);
  assert.match(g.getObjective(), /击败末影龙/);
});

test('redstone-triggered TNT damages nearby crystal shields and health while distant crystals remain intact', () => {
  const g = game(); g._changeStage('end'); g._spawnTimer = Infinity;
  const crystal = g.state.crystals[0], tnt = forge(g, 'tnt'), redstone = forge(g, 'redstone_block');
  Object.assign(tnt, { x: crystal.x, y: crystal.y, vx: 0, vy: 0 });
  Object.assign(redstone, { x: crystal.x - 20, y: crystal.y, vx: 1000, vy: 0 });
  const hp = g.state.hp;
  g._ballPair(redstone, tnt);
  assert.equal(tnt.detonated, true);
  assert.equal(crystal.shield, 0);
  assert.equal(crystal.hp, 40);
  assert.ok(g.state.crystals.slice(1).every(other => other.shield === 80 && other.hp === 100));
  assert.equal(g.state.hp, hp);
  assert.ok(!g.state.bossesSpawned.includes('dragon'));
});

test('material-crafted pickaxe progression increases actual mining damage and preserves the previous tool on failure', () => {
  function damage(advanced) {
    const g = game(); g.state.resources = []; g._spawnTimer = Infinity;
    if (advanced) {
      for (const id of ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe']) {
        const recipe = RECIPES.find(item => item.id === id);
        for (const [material, amount] of Object.entries(recipe.cost)) g.state.materials[material] = amount;
        assert.equal(g.craft(id), true);
      }
      assert.equal(g.state.pickaxe, 'diamond');
      const materials = structuredClone(g.state.materials);
      assert.equal(g.craft('iron_pickaxe'), false);
      assert.deepEqual(g.state.materials, materials);
      assert.equal(g.state.pickaxe, 'diamond');
    }
    const resource = g._spawnResource('ore', 175, 150, 'obsidian');
    Object.assign(g.state.balls[0], { x: 120, y: 150 }); g.shoot(0, 1); g.update(.05);
    assert.ok(resource.hp > 0, 'durable obsidian survives the first impact');
    return resource.maxHp - resource.hp;
  }
  const hand = damage(false), diamond = damage(true);
  assert.ok(hand > 0 && hand < 20);
  assert.ok(diamond > hand * 4);
});

test('ore rewards grant the named realm material exactly once including netherite scraps', () => {
  for (const [material, key, amount] of [['obsidian', 'obsidian', 2], ['quartz', 'quartz', 3], ['netherite', 'netheriteScrap', 2]]) {
    const g = game(); g.state.resources = [];
    const resource = g._spawnResource('ore', 175, 150, material);
    const before = g.state.materials[key] || 0, stone = g.state.materials.stone;
    g._damageResource(resource, resource.hp - 1);
    assert.equal(g.state.materials[key] || 0, before);
    g._damageResource(resource, 1);
    assert.equal(g.state.materials[key], before + amount);
    assert.equal(g.state.materials.stone, stone + 3);
    const collected = structuredClone(g.state.materials);
    g._damageResource(resource, 1000); assert.deepEqual(g.state.materials, collected);
  }
});

test('independent shop purchases are atomic, finite and share book stock with the book API', () => {
  const g = game(); g.togglePause();
  const initial = structuredClone(g.state.materials);
  assert.equal(g.buyOffer('potion_ready'), false);
  assert.equal(g.buyOffer('invented'), false);
  assert.deepEqual(g.state.materials, initial);
  Object.assign(g.state.materials, { gold: 2, bone: 2, wood: 10, stone: 10 });
  assert.equal(g.buyOffer('potion_ready'), true);
  assert.equal(g.state.items.potion, 1); assert.equal(g.state.materials.gold, 1); assert.equal(g.state.materials.bone, 1);
  assert.equal(g.buyOffer('potion_ready'), true);
  const sold = structuredClone(g.state.materials);
  assert.equal(g.buyOffer('potion_ready'), false); assert.deepEqual(g.state.materials, sold);
  assert.equal(g.state.items.potion, 2);
  assert.equal(g.buyOffer('book:power'), true);
  assert.equal(g.state.books.power, 1);
  assert.equal(g.state.bookOffers.find(offer => offer.enchantId === 'power').stock, 0);
  assert.equal(g.state.shopOffers.find(offer => offer.enchantId === 'power').stock, 0);
  const spent = structuredClone(g.state.materials);
  assert.equal(g.buyBook('power'), false); assert.deepEqual(g.state.materials, spent);
});

test('shop stock refreshes once at a new wave and realm changes replace realm-specific offers', () => {
  const g = game(); g._spawnTimer = Infinity; g.state.materials.stone = 100;
  assert.equal(g.buyOffer('wood_bundle'), true); assert.equal(g.buyOffer('wood_bundle'), true);
  assert.equal(g.canBuy('wood_bundle').ok, false);
  g.update(29.99);
  assert.equal(g.state.shopOffers.find(offer => offer.id === 'wood_bundle').stock, 0);
  g.update(.02);
  assert.equal(g.state.stageWave, 2);
  assert.equal(g.state.shopOffers.find(offer => offer.id === 'wood_bundle').stock, 2);
  assert.equal(g.buyOffer('wood_bundle'), true); g.update(.01);
  assert.equal(g.state.shopOffers.find(offer => offer.id === 'wood_bundle').stock, 1);
  assert.ok(g.state.shopOffers.some(offer => offer.id === 'obsidian_bundle'));
  g._changeStage('nether');
  assert.ok(!g.state.shopOffers.some(offer => offer.id === 'obsidian_bundle'));
  assert.ok(g.state.shopOffers.some(offer => offer.id === 'pearl_bundle'));
  const before = structuredClone(g.state.materials);
  assert.equal(g.buyOffer('obsidian_bundle'), false);
  assert.deepEqual(g.state.materials, before);
});

function isolatedExpedition(onEvent = () => {}) {
  const g = new Game({ random: () => 0.55, onEvent });
  g.start(); g._spawnTimer = Infinity; g._treeTimer = Infinity; g._oreTimer = Infinity;
  return g;
}

test('rain reduces fire damage, boosts lightning and leaves physical block impacts unchanged', () => {
  const damage = (weather, effect) => {
    const g = isolatedExpedition(); g.state.weather = weather;
    const target = g._spawnEnemy('zombie', { x: 175, y: 150, hp: 1000, maxHp: 1000, speed: 0 });
    const ball = g.state.balls[0]; Object.assign(ball, { x: 120, y: 150 });
    if (effect === 'fire') { g.state.items.fire_charge = 1; g.useItem('fire_charge', 175, 150); }
    if (effect === 'lightning') g._lightning(ball, 100, 1);
    if (effect === 'physical') { g.shoot(0, 1); g.update(.05); }
    return 1000 - target.hp;
  };
  assert.ok(Math.abs(damage('rain', 'fire') / damage('sunny', 'fire') - 0.6) < 1e-9);
  assert.ok(Math.abs(damage('storm', 'lightning') / damage('sunny', 'lightning') - 1.4) < 1e-9);
  assert.equal(damage('rain', 'physical'), damage('sunny', 'physical'));
});

test('lightning rods redirect storm strikes into enemies and protect the base', () => {
  for (const withRod of [false, true]) {
    const events = []; const g = isolatedExpedition(e => events.push(e)); g.state.weather = 'storm';
    const target = g._spawnEnemy('zombie', { x: 650, y: 250, hp: 1000, maxHp: 1000, speed: 0 });
    if (withRod) {
      g.state.items.lightning_rod = 1;
      assert.equal(g.useItem('lightning_rod', 620, 250), true);
    }
    g._strikeLightning(500, 360);
    assert.equal(g.state.hp, withRod ? 120 : 115);
    assert.equal(events.find(e => e.type === 'weatherStrike').redirected, withRod);
    if (withRod) { assert.equal(target.hp, 930); assert.equal(g.state.structures.length, 1); }
  }
});

test('weather changes after two overworld waves, night increases density, and other realms stay weather-fixed', () => {
  const events = []; const g = isolatedExpedition(e => events.push(e));
  g.update(59.99); assert.equal(g.state.weather, 'sunny');
  g.update(.02); assert.notEqual(g.state.weather, 'sunny');
  assert.ok(events.some(e => e.type === 'weatherChange'));
  g.state.stageElapsed = 90; g.state.weather = 'sunny';
  const day = g._spawnProfile(); g.state.weather = 'night'; const night = g._spawnProfile();
  assert.equal(day.count, night.count);
  assert.ok(Math.abs(day.interval / night.interval - 1.5) < 1e-9);
  g._changeStage('nether'); g._spawnTimer = Infinity; g.update(120);
  assert.equal(g.state.weather, 'nether');
  g._changeStage('end'); g._spawnTimer = Infinity; g.update(61);
  assert.equal(g.state.weather, 'end');
});

test('zombified piglins wander peacefully until player damage enrages current and future piglins', () => {
  const g = isolatedExpedition();
  const piglin = g._spawnEnemy('zombified_piglin', { x: 800, y: 200 });
  g.update(.1); assert.ok(piglin.y < 200); assert.equal(g.state.piglinAggro, false);
  g._areaDamage(piglin.x, piglin.y, 20, 1, '#fff', 'weather', 1);
  assert.equal(g.state.piglinAggro, false, 'environmental damage must not blame the player');
  g._damage(piglin, 1, '#fff', g.state.balls[0]);
  assert.equal(g.state.piglinAggro, true);
  const oldY = piglin.y;
  const newcomer = g._spawnEnemy('zombified_piglin', { x: 800, y: 250 });
  g.update(.1);
  assert.ok(piglin.y > oldY);
  assert.ok(newcomer.y > 250);
});

test('piglin brutes chase native and fused gold bait and fall back to the base when it disappears', () => {
  for (const fused of [false, true]) {
    const g = isolatedExpedition(); let gold = forge(g, 'gold_block');
    if (fused) { g.state.stations.anvil = true; const cue = g.state.balls[0]; g.fuseBlocks(cue.id, gold.id); gold = cue; }
    Object.assign(gold, { x: 300, y: 100, vx: 0, vy: 0 });
    const brute = g._spawnEnemy('piglin_brute', { x: 100, y: 100 });
    g.update(.1); assert.equal(brute.attractedTo, gold.id); assert.ok(brute.x > 100); assert.equal(brute.y, 100);
    g.state.balls = g.state.balls.filter(ball => ball.id !== gold.id);
    g.update(.1); assert.equal(brute.attractedTo, undefined); assert.ok(brute.y > 100);
    assert.ok(Number.isFinite(brute.x) && Number.isFinite(brute.y));
  }
});

test('evokers summon bounded vex waves and cannot create unlimited minions', () => {
  const g = isolatedExpedition(); g._changeStage('nether'); g._spawnTimer = Infinity;
  const evokers = [[100, 100], [800, 100], [100, 620]].map(([x, y]) => g._spawnEnemy('evoker', { x, y, speed: 0, attackCooldown: 0 }));
  let maximum = 0;
  for (let i = 0; i < 180; i += 1) {
    g.update(.25);
    const vexes = g.state.enemies.filter(e => e.kind === 'vex' && e.hp > 0);
    maximum = Math.max(maximum, vexes.length);
    assert.ok(vexes.length <= 12);
    for (const evoker of evokers) assert.ok(vexes.filter(vex => vex.summonerId === evoker.id).length <= 4);
  }
  assert.ok(maximum >= 6);
  for (const evoker of evokers) assert.equal(evoker.totalSummoned, 8);
});

test('witch healing is local, respects maximum health, and does not heal distant enemies', () => {
  const g = isolatedExpedition();
  const witch = g._spawnEnemy('witch', { x: 200, y: 200, speed: 0, attackCooldown: 0 });
  const near = g._spawnEnemy('zombie', { x: 260, y: 200, hp: 20, maxHp: 100, speed: 0 });
  const far = g._spawnEnemy('zombie', { x: 600, y: 200, hp: 20, maxHp: 100, speed: 0 });
  g.update(.01); assert.equal(near.hp, 32); assert.equal(far.hp, 20);
  near.hp = 99; witch.attackCooldown = 0; g.update(.01); assert.equal(near.hp, 100);
});

test('husks slow struck blocks, magma cubes ignite and split, and vindicators hit harder', () => {
  const huskGame = isolatedExpedition();
  huskGame._spawnEnemy('husk', { x: 175, y: 150, hp: 1000, maxHp: 1000, speed: 0 });
  Object.assign(huskGame.state.balls[0], { x: 120, y: 150, vx: 1000, vy: 0 });
  huskGame.update(.05); assert.ok(huskGame.state.balls[0].sandTimer > 2);
  const magmaGame = isolatedExpedition();
  const magma = magmaGame._spawnEnemy('magma_cube', { x: 175, y: 150, size: 2, hp: 1000, maxHp: 1000, speed: 0 });
  Object.assign(magmaGame.state.balls[0], { x: 120, y: 150, vx: 1000, vy: 0 });
  magmaGame.update(.05); assert.ok(magmaGame.state.balls[0].fireTimer > 4);
  magmaGame._damage(magma, 10000, '#fff');
  assert.equal(magmaGame.state.enemies.filter(e => e.kind === 'magma_cube' && e.size === 1 && e.hp > 0).length, 2);
  const burning = isolatedExpedition(); burning._spawnEnemy('magma_cube', { x: 500, y: 390, size: 1 });
  burning.update(.01); assert.equal(burning.state.hp, 113); assert.ok(burning.state.baseBurnTimer > 0);
  burning.update(1.1); assert.equal(burning.state.hp, 112);
  const vindicator = isolatedExpedition(); vindicator._spawnEnemy('vindicator', { x: 500, y: 390 });
  vindicator.update(.01); assert.equal(vindicator.state.hp, 108);
});

test('ghast fireballs reflect off blocks, reverse the block, damage the shooter, and never damage the base after reflection', () => {
  const g = isolatedExpedition();
  const ghast = g._spawnEnemy('ghast', { x: 300, y: 150, speed: 0, attackCooldown: 999 });
  const cue = g.state.balls[0]; Object.assign(cue, { x: 200, y: 150, vx: 500, vy: 0 });
  const fireball = g._spawnProjectile('enemy', 'fireball', 225, 150, Math.PI, 5, 130, { sourceId: ghast.id, sourceKind: 'ghast', sourceX: ghast.x, sourceY: ghast.y, reflectable: true });
  g.update(.5);
  assert.equal(fireball.owner, 'ally'); assert.equal(fireball.reflected, true); assert.equal(fireball.reflectedBy, cue.id);
  assert.ok(cue.vx < 0);
  assert.ok(Math.abs(ghast.hp - (ghast.maxHp - 45 * 1.08)) < 1e-9, 'the reflected projectile receives the first valid ricochet bonus exactly once');
  assert.ok(!(ghast.slowTimer > 0), 'reflected fire is not a slowing snowball');
  assert.equal(g.state.hp, 120);
});

test('rain strengthens tridents and storm tridents call redirectable lightning on impact', () => {
  for (const [weather, withRod, expectedHp] of [['sunny', false, 117], ['rain', false, 115], ['storm', false, 110], ['storm', true, 115]]) {
    const events = []; const g = isolatedExpedition(e => events.push(e)); g.state.weather = weather;
    if (withRod) { g.state.items.lightning_rod = 1; g.useItem('lightning_rod', 620, 250); }
    g._spawnEnemy('trident_drowned', { x: 200, y: 150, speed: 0, attackCooldown: 0 });
    g.update(.01);
    const trident = g.state.projectiles.find(projectile => projectile.kind === 'trident'); assert.ok(trident);
    Object.assign(trident, { x: 500, y: 315, vx: 0, vy: 200 });
    g.update(.01);
    assert.equal(g.state.hp, expectedHp);
    assert.equal(events.some(event => event.type === 'weatherStrike'), weather === 'storm');
  }
});

test('nether spawning supplies both portal ingredients predictably while retaining the overworld minority', () => {
  const g = isolatedExpedition(); g._changeStage('nether');
  g.random = () => 0.2;
  const kinds = Array.from({ length: 8 }, () => g._chooseStageEnemy(g._spawnProfile()).kind);
  assert.equal(kinds.filter(kind => kind === 'blaze').length, 2);
  assert.equal(kinds.filter(kind => kind === 'enderman').length, 2);
  assert.ok(kinds.includes('ghast') && kinds.includes('magma_cube') && kinds.includes('zombified_piglin') && kinds.includes('piglin_brute'));
  g.random = () => 0.9;
  const minority = g._chooseStageEnemy(g._spawnProfile()).kind;
  assert.ok(['zombie', 'drowned', 'husk', 'slime', 'shield_zombie', 'skeleton', 'creeper', 'trident_drowned', 'evoker', 'vindicator', 'witch', 'enderman'].includes(minority));
  const blaze = g._spawnEnemy('blaze'); const enderman = g._spawnEnemy('enderman');
  g._damage(blaze, 1000, '#fff'); g._damage(enderman, 1000, '#fff');
  assert.equal(g.state.materials.blazePowder, 3); assert.equal(g.state.materials.blazeRod, 2); assert.equal(g.state.materials.endPearl, 2);
});

test('new enemy varieties retain arena bounds even after large impulses', () => {
  const g = isolatedExpedition();
  for (const kind of ['drowned', 'husk', 'trident_drowned', 'evoker', 'vex', 'vindicator', 'witch', 'zombified_piglin', 'piglin_brute', 'magma_cube', 'ghast']) g._spawnEnemy(kind, { x: 1000, y: 800, vx: 1200, vy: 1200, attackCooldown: 999 });
  g.update(.2);
  for (const enemy of g.state.enemies) {
    assert.ok([enemy.x, enemy.y, enemy.vx, enemy.vy].every(Number.isFinite));
    assert.ok(enemy.x - enemy.r >= WORLD.margin - 1e-8 && enemy.x + enemy.r <= WORLD.width - WORLD.margin + 1e-8);
    assert.ok(enemy.y - enemy.r >= WORLD.margin - 1e-8 && enemy.y + enemy.r <= WORLD.height - WORLD.margin + 1e-8);
  }
});

test('beginAim previews one speed-based catch, keeps old bounce state, and cancel restores motion without awarding it', () => {
  const events = [];
  const g = new Game({ random: () => 0.1, onEvent: event => events.push(event) }); g.start();
  const ball = g.state.balls[0];
  Object.assign(ball, { x: 180, y: 180, vx: 800, vy: -100 });
  g._recordRicochet(ball, 800, 'test');
  const record = structuredClone(ball.ricochet), start = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
  assert.equal(g.beginAim(ball.id), true);
  const info = g.getAimInfo();
  assert.equal(info.active, true); assert.equal(info.grade, 'perfect'); assert.equal(info.precise, true);
  assert.ok(info.damageBonus > 0); assert.ok(info.speedBonus > 0);
  assert.equal(ball.aimHeld, true); assert.equal(ball.vx, 0); assert.equal(ball.vy, 0);
  assert.deepEqual(ball.ricochet, record);
  assert.equal(describeCatch(ball).active, false);
  g.advanceAim(0.2);
  assert.equal(g.cancelAim(), true);
  assert.deepEqual({ x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy }, start);
  assert.equal(ball.aimHeld, undefined);
  assert.equal(describeCatch(ball).active, false);
  assert.equal(g.state.shots, 0);
  assert.equal(g.beginAim(ball.id), true);
  assert.equal(g.getAimInfo().streak, 1);
  assert.equal(events.filter(event => event.type === 'catch').length, 1, 'cancel and recatch cannot reroll or repeat catch celebration');
  assert.equal(events.some(event => event.type === 'catchShot'), false);
});

test('successful catch shooting consumes the preview once and replaces perpendicular velocity with a bounded boosted shot', () => {
  const g = game(), ball = g.state.balls[0];
  Object.assign(ball, { x: 150, y: 150, vx: 0, vy: 1000 });
  assert.equal(g.beginAim(ball.id), true);
  const preview = g.getAimInfo();
  assert.equal(g.shoot(0, 0.6, ball.id), true);
  assert.equal(g.getAimInfo().active, false); assert.equal(ball.aimHeld, undefined);
  const caught = describeCatch(ball);
  assert.equal(caught.damageBonus, preview.damageBonus);
  assert.equal(caught.streak, 1);
  assert.equal(ball.vy, 0);
  assert.ok(Math.abs(ball.vx - (290 + 0.6 * 850) * (1 + preview.speedBonus)) < 1e-9);
  assert.ok(Math.hypot(ball.vx, ball.vy) <= 1250);
  assert.equal(g.shoot(0, 0.6, ball.id), false);
  assert.equal(g.beginAim(ball.id), true);
  assert.equal(g.getAimInfo().damageBonus, 0, 'an immediate regrab before any flight cannot grow the catch streak');
  g.advanceAim(0.3);
  assert.equal(g.shoot(0, 0.6, ball.id), true);
  assert.equal(describeCatch(ball).active, false);
});

test('catch streak grows only after real flight and its current-shot bonuses remain capped', () => {
  const g = game(), ball = g.state.balls[0];
  ball.vx = 1100;
  for (let streak = 1; streak <= 14; streak += 1) {
    g.state.elapsed += 0.2;
    assert.equal(g.beginAim(ball.id), true);
    assert.equal(g.getAimInfo().streak, streak);
    g.advanceAim(0.4);
    assert.equal(g.shoot(0, 1), true);
    const reward = describeCatch(ball);
    assert.equal(reward.streak, streak);
    assert.ok(reward.damageBonus <= 0.6);
    assert.ok(reward.speedBonus <= 0.12);
    assert.ok(Math.hypot(ball.vx, ball.vy) <= 1250);
  }
  ball.vx = ball.vy = 0; g.update(0.01);
  assert.equal(describeCatch(ball).active, false);
  assert.equal(g.beginAim(ball.id), true);
  assert.equal(g.getAimInfo().streak, 0);
});

test('catch damage multiplies direct impacts and already-scaled elemental damage exactly once', () => {
  function trial(caught) {
    const g = game(); g.state.resources = [];
    const ball = g._newBall('storm', 100, 150); g.state.balls = [ball];
    if (caught) { ball.vy = 900; g.beginAim(ball.id); }
    g.shoot(0, 0.5, ball.id);
    const multiplier = describeCatch(ball).multiplier;
    Object.assign(ball, { x: 100, y: 150, vx: 400, vy: 0 });
    const direct = enemy(1000, 125, 150, { hp: 10000, maxHp: 10000 });
    const chain = enemy(1001, 180, 170, { hp: 10000, maxHp: 10000 });
    g.state.enemies = [direct, chain];
    g._ballEnemy(ball, direct);
    return { multiplier, damage: 10000 - direct.hp, chain: 10000 - chain.hp };
  }
  const normal = trial(false), caught = trial(true);
  assert.ok(normal.chain > 0);
  assert.ok(Math.abs(caught.damage / normal.damage - caught.multiplier) < 1e-8);
  assert.ok(Math.abs(caught.chain / normal.chain - caught.multiplier) < 1e-8);
});

test('held aim blocks cannot damage, mine, collect XP, bounce other blocks, reflect fireballs or be stolen', () => {
  const g = game(), ball = g.state.balls[0];
  g.state.resources = []; g._spawnTimer = Infinity;
  Object.assign(ball, { x: 160, y: 160, vx: 800, vy: 0 });
  const resource = g._spawnResource('tree', 160, 160);
  const mob = g._spawnEnemy('enderman', { x: 170, y: 160, speed: 0, hp: 1000 });
  const other = g._newBall('iron', 180, 160); other.vx = -200; g.state.balls.push(other);
  const projectile = g._spawnProjectile('enemy', 'fireball', 160, 160, 0, 8, 10, { reflectable: true, sourceId: mob.id });
  g._dropExperience(160, 160, 2);
  assert.equal(g.beginAim(ball.id), true);
  const treeHp = resource.hp;
  g._ballResource(ball, resource); g._ballEnemy(ball, mob); g._ballPair(ball, other);
  assert.equal(resource.hp, treeHp); assert.equal(mob.hp, 1000); assert.equal(other.vx, -200);
  other.x = 850; other.y = 600;
  g.advanceAim(0.1);
  assert.equal(g.state.xp, 0);
  assert.equal(g.state.qte, null);
  assert.equal(ball.heldBy, undefined);
  assert.equal(projectile.owner, 'enemy'); assert.equal(projectile.reflected, undefined);
  assert.equal(resource.hp, treeHp); assert.equal(mob.hp, 1000);
  assert.equal(ball.x, 160); assert.equal(ball.y, 160);
});

test('slow aim advances other balls, enemies, projectiles, resources, workers, waves, weather and regeneration together', () => {
  const g = game(), s = g.state, ball = s.balls[0];
  g._spawnTimer = Infinity;
  Object.assign(s.materials, { wood: 20, stone: 20 }); g.hireWorker('miner');
  const worker = s.workers[0], workerLife = worker.life;
  s.beacon.upgrades.regen = 1; s.regenTimer = 0.1; s.hp = 60;
  s.elapsed = s.stageElapsed = 59.8; s.stageWave = 2; g._lastStageWave = 2;
  Object.assign(ball, { x: 150, y: 150, vx: 800, vy: 0 });
  const other = g._newBall('iron', 700, 580); other.vx = 300; s.balls.push(other);
  const mob = g._spawnEnemy('zombie', { x: 100, y: 500 });
  const projectile = g._spawnProjectile('enemy', 'arrow', 100, 100, 0, 1, 100);
  const resource = s.resources[0]; resource.flash = 0.12;
  g.beginAim(ball.id);
  const simulated = g.advanceAim(0.8);
  assert.ok(Math.abs(simulated - 0.24) < 1e-8);
  assert.ok(other.x > 700); assert.ok(mob.x > 100); assert.ok(projectile.x > 100);
  assert.equal(ball.x, 150); assert.equal(ball.y, 150);
  assert.ok(Math.abs(worker.life - (workerLife - simulated)) < 1e-8);
  assert.equal(resource.flash, 0);
  assert.equal(s.stageWave, 3); assert.notEqual(s.weather, 'sunny');
  assert.equal(s.hp, 66);
  assert.equal(g.getAimInfo().active, true);
});

test('end-rod dilation and its rod-only enchantment stay nonzero and do not leak from unequipped rods', () => {
  const g = game(), s = g.state, ball = s.balls[0];
  s.ownedRods.push('end');
  s.stations.anvil = true; s.books.time_dilation = 4; s.xp = 100;
  assert.equal(g.canEnchant({ kind: 'ball', id: ball.id }, 'book', 'time_dilation').ok, false);
  for (let rank = 0; rank < 4; rank += 1) assert.equal(g.enchant({ kind: 'rod', id: 'end' }, 'book', 'time_dilation'), true);
  assert.equal(g.beginAim(ball.id), true);
  assert.equal(g.getAimInfo().timeScale, 0.3);
  g.cancelAim(); g.equipRod('end'); g.beginAim(ball.id);
  assert.ok(Math.abs(g.getAimInfo().timeScale - 0.15 * 0.8 ** 4) < 1e-9);
  assert.ok(g.getAimInfo().timeScale >= 0.06);
  assert.ok(g.advanceAim(1) > 0.06);
  assert.equal(g._isFreeUpgradeAvailable('time_dilation'), false);
});

test('aim rejects invalid targets atomically and switching held blocks restores the previous motion', () => {
  const g = game(), s = g.state, ball = s.balls[0]; ball.vx = 500;
  const ghost = g._newBall('ghost', 100, 100); ghost.life = 1; s.balls.push(ghost);
  const held = g._newBall('iron', 800, 100); held.heldBy = 123; s.balls.push(held);
  assert.equal(g.beginAim(ball.id), true);
  for (const id of [99999, ghost.id, held.id]) {
    const before = structuredClone(s);
    assert.equal(g.beginAim(id), false); assert.deepEqual(s, before);
  }
  delete held.heldBy; held.vy = 600;
  assert.equal(g.beginAim(held.id), true);
  assert.equal(ball.vx, 500); assert.equal(ball.aimHeld, undefined);
  assert.equal(held.aimHeld, true); assert.equal(g.getAimInfo().ballId, held.id);
  assert.equal(g.shoot(0, 1, ball.id), false);
});

test('pause, upgrade, defeat, victory, recall, fusion, teleport and stage changes release an active aim safely', () => {
  for (const action of ['pause', 'upgrade', 'lost', 'won', 'recall', 'fusion', 'teleport', 'stage']) {
    const g = game(), s = g.state, ball = s.balls[0]; ball.vx = 600;
    g._spawnTimer = Infinity;
    assert.equal(g.beginAim(ball.id), true);
    if (action === 'pause') g.togglePause();
    if (action === 'upgrade') { s.pendingUpgrades = 1; g.advanceAim(0.1); }
    if (action === 'lost') { s.hp = 0; g.advanceAim(0.1); }
    if (action === 'won') { s.stage = 'end'; s.bossesDefeated.push('dragon'); g.advanceAim(0.1); }
    if (action === 'recall') assert.equal(g.recall(), true);
    if (action === 'fusion') { s.stations.anvil = true; const donor = g._newBall('iron', 700, 600); s.balls.push(donor); assert.equal(g.fuseBlocks(ball.id, donor.id), true); }
    if (action === 'teleport') { s.items.ender_pearl = 1; assert.equal(g.useItem('ender_pearl', 100, 100, ball.id), true); }
    if (action === 'stage') g._changeStage('nether');
    assert.equal(g.getAimInfo().active, false, action);
    assert.equal(ball.aimHeld, undefined, action);
    assert.equal(describeCatch(ball).active, false, action);
  }
});

test('an upgrade collected by another moving block interrupts aim at a simulation boundary without granting a catch reward', () => {
  const g = game(), s = g.state, ball = s.balls[0];
  Object.assign(ball, { x: 150, y: 150, vx: 700, vy: 0 });
  const collector = g._newBall('iron', 850, 580); s.balls.push(collector);
  g._dropExperience(collector.x, collector.y, 5);
  g.beginAim(ball.id);
  const simulated = g.advanceAim(1);
  assert.ok(simulated > 0 && simulated < 0.3);
  assert.equal(s.phase, 'upgrade'); assert.equal(s.pendingUpgrades, 1);
  assert.equal(s.aim, null); assert.equal(ball.aimHeld, undefined); assert.equal(ball.vx, 700);
  assert.equal(s.shots, 0); assert.equal(describeCatch(ball).active, false);
});
