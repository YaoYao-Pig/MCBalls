import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD, UPGRADES, RECIPES, BEACON_TIERS, BEACON_UPGRADES, describeRicochet } from '../src/core.js';

function setup() {
  const events = [];
  const game = new Game({ random: () => 0.55, onEvent: event => events.push(event) });
  game.start();
  game._spawnTimer = game._treeTimer = game._oreTimer = Infinity;
  game.state.resources = [];
  return { game, events, s: game.state };
}
function fund(game) { for (const key of Object.keys(game.state.materials)) game.state.materials[key] = 10000; }
function level(game, target) { while (game.state.beacon.level < target) assert.equal(game.upgradeBeacon('level'), true); }
function enemy(game, x, y, kind = 'zombie') {
  const result = game._spawnEnemy(kind, { x, y });
  Object.assign(result, { hp: 10000, maxHp: 10000, speed: 0, attackCooldown: 10000 });
  return result;
}
function baseBounce(game, ball, speed = 400) {
  Object.assign(ball, { x: 500, y: 360 + WORLD.baseRadius + ball.r - 1, vx: 0, vy: -speed });
  game._ballBase(ball);
}

test('beacon levels have four pyramid layers and upgrade atomically with explicit material and state failures', () => {
  const { game, s } = setup();
  assert.equal(s.beacon.level, 1);
  assert.equal(game.getBeaconInfo().pyramidLayers, 0);
  assert.equal(BEACON_TIERS.at(-1).pyramidLayers, 4);
  assert.equal(game.getBeaconInfo().upgrades.length, BEACON_UPGRADES.length);
  const before = structuredClone(s);
  assert.equal(game.upgradeBeacon('level'), false);
  assert.equal(game.upgradeBeacon('missing'), false);
  assert.deepEqual(s, before);
  fund(game);
  s.hp = 50;
  s.phase = 'paused';
  const cost = game.canUpgradeBeacon('level').cost;
  const materials = { ...s.materials };
  assert.equal(game.upgradeBeacon('level'), true);
  assert.equal(s.maxHp, 150);
  assert.equal(s.hp, 78);
  for (const [key, amount] of Object.entries(cost)) assert.equal(s.materials[key], materials[key] - amount);
  assert.equal(game.getBeaconInfo().pyramidLayers, 1);
  level(game, 5);
  assert.equal(s.maxHp, 300);
  for (const phase of ['ready', 'upgrade', 'transition', 'won', 'lost']) {
    s.phase = phase;
    const snapshot = structuredClone(s);
    assert.equal(game.upgradeBeacon('shield'), false);
    assert.deepEqual(s, snapshot);
  }
  s.phase = 'playing';
  const snapshot = structuredClone(s);
  assert.equal(game.upgradeBeacon('level'), false);
  assert.deepEqual(s, snapshot);
});

test('beacon ranks require higher body levels and have rising costs without consuming blocked purchases', () => {
  const { game, s } = setup(); fund(game);
  assert.equal(game.canUpgradeBeacon('shock').requiredLevel, 3);
  assert.match(game.canUpgradeBeacon('shock').reason, /3/);
  assert.equal(game.upgradeBeacon('shock'), false);
  const first = game.canUpgradeBeacon('shield').cost;
  assert.equal(game.upgradeBeacon('shield'), true);
  assert.equal(s.shield, 30);
  assert.equal(s.maxShield, 30);
  assert.equal(game.canUpgradeBeacon('shield').locked, true);
  level(game, 2);
  assert.ok(game.canUpgradeBeacon('shield').cost.iron > first.iron);
  assert.equal(game.upgradeBeacon('shield'), true);
  assert.equal(s.maxShield, 60);
  const hp = s.hp;
  game._hurtBase(35);
  assert.equal(s.shield, 25);
  assert.equal(s.hp, hp);
  for (let index = 0; index < 10; index += 1) game._syncBaseStats();
  assert.equal(s.shield, 25, 'reading/recomputing must not refill spent shields');
});

test('beacon repair raises HP and heals once while passive regeneration observes game time', () => {
  const { game, s } = setup(); fund(game); s.hp = 20;
  assert.equal(game.upgradeBeacon('repair'), true);
  assert.equal(s.maxHp, 132);
  assert.equal(s.hp, 58);
  for (let index = 0; index < 10; index += 1) game.getBeaconInfo();
  assert.equal(s.hp, 58);
  level(game, 2);
  assert.equal(game.upgradeBeacon('regen'), true);
  s.hp = 40;
  game.update(10);
  assert.equal(s.hp, 46);
  game.togglePause();
  const before = structuredClone(s);
  game.update(30);
  assert.deepEqual(s, before);
  game.togglePause(); s.hp = s.maxHp - 1; game.update(10);
  assert.equal(s.hp, s.maxHp);
});

test('beacon pulses and recall bursts preserve their combat effects through the new acquisition path', () => {
  const { game, s, events } = setup(); fund(game); level(game, 2);
  assert.equal(game.upgradeBeacon('pulse'), true);
  assert.equal(game.upgradeBeacon('recall_burst'), true);
  const near = enemy(game, 590, 360), far = enemy(game, 850, 360);
  baseBounce(game, s.balls[0]);
  assert.equal(near.hp, 10000 - 32);
  assert.equal(far.hp, 10000);
  assert.equal(s.pulseCooldown, 2);
  const hp = near.hp;
  baseBounce(game, s.balls[0]);
  assert.equal(near.hp, hp);
  s.combo = 6;
  assert.equal(game.recall(), true);
  assert.ok(near.hp < hp);
  assert.ok(events.some(event => event.type === 'pulse' && event.source === 'recall'));
  assert.deepEqual(s.upgrades, {});
  assert.deepEqual(s.baseEnchantments, {});
});

test('base rewards cannot be obtained through crafting, enchantments, books or free choices', () => {
  const { game, s } = setup(); fund(game);
  assert.equal(RECIPES.some(recipe => recipe.id === 'repair' || recipe.kind === 'base'), false);
  assert.equal(game.craft('repair'), false);
  Object.assign(s.stations, { enchantingTable: true, anvil: true });
  s.xp = 100; s.books.shield = 1;
  const target = { kind: 'base', id: 'core' };
  for (const mode of ['random', 'add', 'book']) {
    const before = structuredClone(s);
    assert.match(game.canEnchant(target, mode, 'shield').reason, /信标/);
    assert.equal(game.enchant(target, mode, 'shield'), false);
    assert.deepEqual(s, before);
  }
  s.bookOffers.push({ id: 'shield', enchantId: 'shield', cost: { wood: 1 }, stock: 1 });
  s.shopOffers.push({ id: 'book:shield', enchantId: 'shield', cost: { wood: 1 }, stock: 1 });
  assert.equal(game.buyBook('shield'), false);
  assert.equal(game.buyOffer('book:shield'), false);
  for (let iteration = 0; iteration < 30; iteration += 1) {
    game.random = () => iteration / 30;
    game._refreshBookOffers();
    assert.ok(s.bookOffers.every(offer => UPGRADES.find(upgrade => upgrade.id === offer.enchantId).category !== 'base'));
  }
  s.phase = 'playing'; s.pendingUpgrades = 1;
  assert.equal(game._checkLevel(), true);
  assert.ok(s.choices.every(id => UPGRADES.find(upgrade => upgrade.id === id).category !== 'base'));
  assert.ok(s.choices.every(id => !id.startsWith('supply_')), 'fallback supplies stay out while three combat upgrades are available');
});

test('base bounce adds its own temporary damage exactly once and never propagates to another block', () => {
  const { game, s, events } = setup(); fund(game); level(game, 2);
  assert.equal(game.upgradeBeacon('base_ricochet'), true);
  const ball = s.balls[0]; baseBounce(game, ball);
  let info = describeRicochet(ball);
  assert.equal(info.count, 1);
  assert.equal(info.baseBonus, 0.12);
  assert.ok(Math.abs(info.damageBonus - 0.2) < 1e-9);
  assert.ok(Math.abs(game._impactMultiplier(ball) - 1.2) < 1e-9);
  baseBounce(game, ball);
  assert.equal(describeRicochet(ball).baseBonus, 0.12, 'same contact window cannot farm base charge');
  s.elapsed += 0.2; baseBounce(game, ball);
  assert.equal(describeRicochet(ball).baseBonus, 0.24);
  const other = game._newBall('storm', 225, 150); s.balls.push(other);
  Object.assign(ball, { x: 200, y: 150, vx: 400, vy: 0 });
  game._ballPair(ball, other);
  assert.equal(describeRicochet(other).baseBonus, 0);
  assert.equal(describeRicochet(ball).baseBonus, 0.24);
  assert.equal(events.filter(event => event.type === 'beaconBounce').length, 2);
  assert.deepEqual(ball.enchantments, {});
  assert.equal(describeRicochet(null).baseBonus, 0);
});

test('base bounce damage is applied once to actual enemy and elemental hits', () => {
  function strike(withBase) {
    const { game, s, events } = setup(); fund(game); level(game, 2);
    if (withBase) game.upgradeBeacon('base_ricochet');
    const ball = game._newBall('storm', 100, 150); s.balls = [ball];
    baseBounce(game, ball);
    Object.assign(ball, { x: 100, y: 150, vx: 400, vy: 0 });
    const direct = enemy(game, 125, 150), chain = enemy(game, 170, 170);
    game._ballEnemy(ball, direct);
    return { damage: 10000 - direct.hp, chain: 10000 - chain.hp, bonus: describeRicochet(ball).damageBonus, events };
  }
  const normal = strike(false), beacon = strike(true);
  const expectedRatio = (1 + beacon.bonus) / (1 + normal.bonus);
  assert.ok(Math.abs(beacon.damage / normal.damage - expectedRatio) < 1e-8);
  assert.ok(normal.chain > 0);
  assert.ok(Math.abs(beacon.chain / normal.chain - expectedRatio) < 1e-8);
});

test('temporary beacon charge clears on a new shot, stop, recall, teleport and stage transition', () => {
  for (const action of ['shot', 'stop', 'recall', 'teleport', 'stage']) {
    const { game, s } = setup(); fund(game); level(game, 2); game.upgradeBeacon('base_ricochet');
    const ball = s.balls[0]; baseBounce(game, ball);
    assert.ok(describeRicochet(ball).baseBonus > 0);
    if (action === 'shot') game.shoot(0, 1);
    if (action === 'stop') { ball.vx = ball.vy = 0; game.update(0.01); }
    if (action === 'recall') game.recall();
    if (action === 'teleport') { s.items.ender_pearl = 1; assert.equal(game.useItem('ender_pearl', 250, 250, ball.id), true); }
    if (action === 'stage') game._changeStage('nether');
    assert.equal(describeRicochet(ball).baseBonus, 0, action);
    assert.equal(ball.beaconRicochetBonus, 0, action);
  }
});

test('slow contacts and transient ghost or TNT blocks cannot earn beacon charge', () => {
  const { game, s, events } = setup(); fund(game); level(game, 2); game.upgradeBeacon('base_ricochet');
  baseBounce(game, s.balls[0], 30);
  assert.equal(describeRicochet(s.balls[0]).baseBonus, 0);
  for (const type of ['ghost', 'tnt']) {
    const ball = game._newBall(type, 500, 410);
    if (type === 'ghost') ball.life = 1;
    s.balls.push(ball); baseBounce(game, ball);
    assert.equal(ball.beaconRicochetBonus, 0);
  }
  assert.equal(events.filter(event => event.type === 'beaconBounce').length, 0);
});

test('automatic shock waits for enemies, applies bounded outward motion, and freezes its cooldown while paused', () => {
  const { game, s, events } = setup(); fund(game); level(game, 3); game.upgradeBeacon('shock');
  game.update(1);
  assert.equal(s.beacon.shockCooldown, 0);
  const close = enemy(game, 600, 360), far = enemy(game, 850, 360);
  game._updateBeacon(0.01);
  assert.equal(close.hp, 9984);
  assert.equal(far.hp, 10000);
  assert.ok(close.vx > 0);
  assert.ok(Math.hypot(close.vx, close.vy) <= 650);
  const cooldown = s.beacon.shockCooldown;
  assert.equal(cooldown, 6.75);
  game.togglePause(); game.update(10);
  assert.equal(s.beacon.shockCooldown, cooldown);
  assert.equal(events.filter(event => event.type === 'pulse' && event.source === 'beacon_shock').length, 1);
  game.togglePause();
  game._updateBeacon(cooldown);
  assert.equal(close.hp, 9968);
  assert.equal(events.filter(event => event.type === 'pulse' && event.source === 'beacon_shock').length, 2);
  assert.ok(close.x - close.r >= WORLD.margin && close.x + close.r <= WORLD.width - WORLD.margin);
});

test('shock pushes every enemy in range up to the arena cap and gives bosses reduced knockback', () => {
  const { game, s } = setup(); fund(game); level(game, 3); game.upgradeBeacon('shock');
  const boss = enemy(game, 580, 360, 'wither');
  for (let index = 0; index < 119; index += 1) { const angle=index/119*Math.PI*2;enemy(game,500+Math.cos(angle)*100,360+Math.sin(angle)*100); }
  game._updateBeacon(0);
  assert.equal(s.enemies.filter(target => target.hp < 10000).length, 120);
  assert.ok(s.enemies.every(target=>Math.hypot(target.vx,target.vy)>0));
  assert.ok(Math.abs(boss.vx - 80) < 1e-9);
  assert.equal(s.enemies.length, 120);
});

test('haste speeds both allied weapon types and mining speed affects workers independently', () => {
  const { game, s } = setup(); fund(game); level(game, 2);
  game.upgradeBeacon('haste'); game.upgradeBeacon('mining_speed');
  const iron = game._spawnAlly('iron_golem'), snow = game._spawnAlly('snow_golem');
  enemy(game, iron.x + 20, iron.y);
  game._updateAllies(0.01);
  assert.ok(Math.abs(iron.attackCooldown - 0.85 / 1.18) < 1e-9);
  assert.ok(Math.abs(snow.attackCooldown - 1.15 / 1.18) < 1e-9);
  assert.equal(game.hireWorker('miner'), true);
  const workerInfo = game.getWorkerInfo().roles.find(role => role.role === 'miner');
  assert.ok(Math.abs(workerInfo.stats.workInterval - 1.15 / 1.15) < 1e-9);
  const worker = s.workers[0];
  const ore = { kind: 'ore', material: 'obsidian' };
  const damage = game.getWorkerMiningDamage(worker, ore);
  s.pickaxe = 'netherite'; s.upgrades.power = 50; s.beacon.upgrades.mining_speed = 5;
  assert.equal(game.getWorkerMiningDamage(worker, ore), damage);
  worker.tool = 'netherite';
  assert.ok(game.getWorkerMiningDamage(worker, ore) > damage * 10);
});

test('stage transitions keep beacon progression and live workers but clear per-ball beacon charge', () => {
  const { game, s } = setup(); fund(game); level(game, 3);
  game.upgradeBeacon('shield'); game.upgradeBeacon('base_ricochet'); game.upgradeBeacon('shock');
  game.hireWorker('miner');
  const worker = s.workers[0]; worker.life = 37; worker.hp = 19;
  const beacon = structuredClone(s.beacon);
  const ball = s.balls[0]; baseBounce(game, ball);
  game._changeStage('nether');
  assert.deepEqual(s.beacon, beacon);
  assert.equal(s.workers[0].id, worker.id);
  assert.equal(worker.life, 37); assert.equal(worker.hp, 19);
  assert.equal(describeRicochet(ball).baseBonus, 0);
  game.reset();
  assert.deepEqual(game.state.beacon, { level: 1, upgrades: {}, shockCooldown: 0 });
  assert.equal(game.state.workers.length, 0);
});
