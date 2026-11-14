import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core.js';
import { initializeWorkers, getWorkerInfo, canHireWorker, hireWorker, canUpgradeWorker, upgradeWorker, updateWorkers, relocateWorkers } from '../src/villager-workers.js';

function setup() {
  const events = [], g = new Game({ random: () => .99, onEvent: event => events.push(event) }); g.start(); initializeWorkers(g);
  g.state.resources = []; g.state.enemies = []; g._spawnTimer = Infinity; g._treeTimer = Infinity; g._oreTimer = Infinity;
  g.state.beacon ||= { level: 1, upgrades: {} };
  for (const id of ['wood', 'stone', 'iron', 'diamond', 'gold', 'netheriteScrap']) g.state.materials[id] = 100;
  return { g, events };
}
function hire(g, role) { assert.equal(hireWorker(g, role), true); return g.state.workers.at(-1); }
function near(worker, resource) { worker.x = resource.x - worker.r - resource.r - 5; worker.y = resource.y; }
function roleInfo(g, role) { return getWorkerInfo(g).roles.find(info => info.role === role); }

test('hiring charges exact costs, supports paused menus and enforces two per profession and four total', () => {
  const { g } = setup(); g.togglePause();
  for (const role of ['lumberjack', 'miner']) for (let count = 0; count < 2; count++) {
    const cost = canHireWorker(g, role).cost, before = structuredClone(g.state.materials);
    const worker = hire(g, role);
    assert.equal(worker.life, 60); assert.equal(worker.maxLife, 60); assert.equal(worker.tool, 'wood');
    for (const [id, value] of Object.entries(before)) assert.equal(g.state.materials[id], value - (cost[id] || 0));
  }
  assert.equal(getWorkerInfo(g).totalCount, 4);
  assert.ok(getWorkerInfo(g).roles.every(info => info.count === 2 && !info.hire.ok));
  const full = structuredClone(g.state);
  assert.equal(hireWorker(g, 'lumberjack'), false); assert.equal(hireWorker(g, 'miner'), false); assert.equal(hireWorker(g, 'invented'), false);
  assert.deepEqual(g.state, full);
});

test('failed hire and upgrade validations never consume materials or change current workers', () => {
  const { g } = setup();
  g.state.materials.wood = 0;
  const before = structuredClone(g.state);
  assert.equal(hireWorker(g, 'lumberjack'), false);
  assert.equal(upgradeWorker(g, 'miner', 'invented'), false);
  assert.deepEqual(g.state, before);
  g.state.materials.wood = 100;
  assert.equal(upgradeWorker(g, 'miner', 'speed'), true);
  assert.equal(canUpgradeWorker(g, 'miner', 'speed').requiredBaseLevel, 2);
  const gated = structuredClone(g.state);
  assert.equal(upgradeWorker(g, 'miner', 'speed'), false);
  assert.deepEqual(g.state, gated);
  g.state.phase = 'transition';
  const moving = structuredClone(g.state);
  assert.equal(hireWorker(g, 'miner'), false); assert.equal(upgradeWorker(g, 'lumberjack', 'tool'), false);
  assert.deepEqual(g.state, moving);
});

test('idle workers remain present until sixty battle seconds and depart only once', () => {
  const { g, events } = setup(), worker = hire(g, 'lumberjack'), position = [worker.x, worker.y];
  updateWorkers(g, 59.9);
  assert.equal(g.state.workers.length, 1); assert.ok(worker.life > 0 && worker.life < .11);
  assert.equal(worker.targetId, null); assert.deepEqual([worker.x, worker.y], position);
  updateWorkers(g, .11); assert.equal(g.state.workers.length, 0);
  updateWorkers(g, 100);
  assert.equal(events.filter(event => event.type === 'workerLeave' && event.id === worker.id).length, 1);
  assert.equal(events.find(event => event.type === 'workerLeave').reason, 'expired');
});

test('worker targeting excludes wrong roles, depleted resources and falling or out-of-bounds ores', () => {
  const { g } = setup(), miner = hire(g, 'miner');
  const tree = g._spawnResource('tree', 200, 150), ore = g._spawnResource('ore', 800, 150, 'iron');
  ore.fallTimer = 2;
  const dead = { id: 9990, kind: 'ore', x: 750, y: 500, r: 18, hp: 0, fallTimer: 0 };
  const outside = { id: 9991, kind: 'ore', x: -100, y: 150, r: 18, hp: 100, fallTimer: 0 };
  g.state.resources.push(dead, outside);
  const position = [miner.x, miner.y]; updateWorkers(g, 1);
  assert.equal(miner.targetId, null); assert.deepEqual([miner.x, miner.y], position);
  assert.equal(tree.hp, tree.maxHp); assert.equal(ore.hp, ore.maxHp);
  ore.fallTimer = 0; updateWorkers(g, .1);
  assert.equal(miner.targetId, ore.id); assert.notDeepEqual([miner.x, miner.y], position);
  ore.hp = 0; updateWorkers(g, .1); assert.equal(miner.targetId, null);
});

test('two workers sharing a final resource hit award materials once and never attack the destroyed target again', () => {
  const { g, events } = setup(), a = hire(g, 'lumberjack'), b = hire(g, 'lumberjack');
  const resource = g._spawnResource('tree', 200, 150); resource.hp = .5; near(a, resource); near(b, resource);
  const wood = g.state.materials.wood;
  updateWorkers(g, .01);
  assert.equal(resource.hp, 0); assert.equal(g.state.materials.wood, wood + 3);
  assert.equal(events.filter(event => event.type === 'workerWork').length, 1);
  assert.equal(a.targetId, null); assert.equal(b.targetId, null);
  updateWorkers(g, 3); assert.equal(g.state.materials.wood, wood + 3);
});

test('worker tools are independent of player tools and low-level hard-ore damage remains substantially weaker', () => {
  const { g } = setup(), miner = hire(g, 'miner'), lumberjack = hire(g, 'lumberjack');
  const ordinary = g._spawnResource('ore', 200, 150, 'iron'), hard = g._spawnResource('ore', 800, 150, 'obsidian');
  const ordinaryDamage = g.getWorkerMiningDamage(miner, ordinary), weak = g.getWorkerMiningDamage(miner, hard);
  assert.ok(weak > 0 && weak < ordinaryDamage * .5);
  g.state.pickaxe = 'netherite';
  assert.equal(g.getWorkerMiningDamage(miner, hard), weak, 'the player pickaxe is never borrowed by a worker');
  g.state.beacon.level = 5;
  for (let level = 0; level < 4; level++) assert.equal(upgradeWorker(g, 'miner', 'tool'), true);
  assert.equal(miner.tool, 'netherite'); assert.equal(lumberjack.tool, 'wood');
  assert.ok(g.getWorkerMiningDamage(miner, hard) > weak * 2);
  assert.equal(hire(g, 'miner').tool, 'netherite');
  const maxed = structuredClone(g.state.materials); assert.equal(upgradeWorker(g, 'miner', 'tool'), false); assert.deepEqual(g.state.materials, maxed);
});

test('duration upgrades extend current remaining time by the increment instead of resetting employment', () => {
  const { g } = setup(), lumberjack = hire(g, 'lumberjack'), miner = hire(g, 'miner');
  lumberjack.life = 10; miner.life = 20;
  assert.equal(upgradeWorker(g, 'lumberjack', 'duration'), true);
  assert.equal(lumberjack.life, 30); assert.equal(lumberjack.maxLife, 80); assert.equal(miner.life, 20);
  const future = hire(g, 'lumberjack'); assert.equal(future.life, 80); assert.equal(future.maxLife, 80);
  g.state.beacon.level = 2;
  assert.equal(upgradeWorker(g, 'lumberjack', 'duration'), true);
  assert.equal(lumberjack.life, 50); assert.equal(future.life, 100);
  assert.equal(lumberjack.maxLife, 100); assert.equal(miner.maxLife, 60);
});

test('profession work speed, beacon mining speed and tool damage multiply independently with bounded intervals', () => {
  const { g } = setup(); g.state.beacon.level = 5;
  const miner = hire(g, 'miner'), resource = g._spawnResource('ore', 200, 150, 'iron');
  const baseline = roleInfo(g, 'miner').stats, damage = g.getWorkerMiningDamage(miner, resource);
  assert.equal(upgradeWorker(g, 'miner', 'work'), true);
  assert.ok(Math.abs(roleInfo(g, 'miner').stats.workInterval - baseline.workInterval / 1.25) < 1e-9);
  assert.equal(g.getWorkerMiningDamage(miner, resource), damage);
  g.state.beacon.upgrades.mining_speed = 1;
  const buffed = roleInfo(g, 'miner').stats.workInterval;
  assert.ok(Math.abs(buffed - baseline.workInterval / 1.25 / 1.15) < 1e-9);
  assert.equal(upgradeWorker(g, 'miner', 'tool'), true);
  assert.equal(roleInfo(g, 'miner').stats.workInterval, buffed);
  assert.ok(g.getWorkerMiningDamage(miner, resource) > damage);
  assert.equal(upgradeWorker(g, 'miner', 'speed'), true);
  assert.ok(roleInfo(g, 'miner').stats.speed > baseline.speed);
  assert.equal(roleInfo(g, 'lumberjack').stats.speed, 44);
  g.state.beacon.upgrades.mining_speed = 1000; g.state.workerUpgrades.miner.work = 1000;
  assert.ok(roleInfo(g, 'miner').stats.workInterval >= .24);
});

test('enemy contact damage is throttled and a dying worker cannot mine or reward a final resource', () => {
  const { g, events } = setup(), miner = hire(g, 'miner');
  const resource = g._spawnResource('ore', 200, 150, 'iron'); near(miner, resource); resource.hp = .5;
  g._spawnEnemy('zombie', { x: miner.x, y: miner.y, speed: 0 });
  miner.workCooldown = 10;
  updateWorkers(g, .01); assert.equal(miner.hp, miner.maxHp - 3);
  updateWorkers(g, .4); assert.equal(miner.hp, miner.maxHp - 3);
  updateWorkers(g, .41); assert.equal(miner.hp, miner.maxHp - 6);
  miner.hp = 1; miner.workCooldown = 0; miner.hurtCooldown = 0;
  const materials = structuredClone(g.state.materials);
  updateWorkers(g, .01);
  assert.equal(g.state.workers.length, 0); assert.equal(resource.hp, .5); assert.deepEqual(g.state.materials, materials);
  updateWorkers(g, 1);
  assert.equal(events.filter(event => event.type === 'workerLeave' && event.reason === 'dead').length, 1);
});

test('neutral zombified piglins do not attack workers until the player angers their faction', () => {
  const { g, events } = setup(), worker = hire(g, 'lumberjack');
  g._spawnEnemy('zombified_piglin', { x: worker.x, y: worker.y, speed: 0 });
  g.state.piglinAggro = false; updateWorkers(g, 1);
  assert.equal(worker.hp, worker.maxHp); assert.equal(events.filter(event => event.type === 'workerHurt').length, 0);
  g.state.piglinAggro = true; updateWorkers(g, .01);
  assert.equal(worker.hp, worker.maxHp - 3);
  assert.equal(events.filter(event => event.type === 'workerHurt').length, 1);
});

test('relocation preserves remaining life, health and role upgrades while discarding old world targets', () => {
  const { g } = setup(), a = hire(g, 'lumberjack'), b = hire(g, 'miner');
  a.life = 17; a.hp = 20; a.targetId = 999; a.workCooldown = 1; b.life = 31; b.hp = 22;
  a.x = b.x = 70; a.y = b.y = 90;
  relocateWorkers(g);
  assert.equal(a.life, 17); assert.equal(a.hp, 20); assert.equal(a.targetId, null); assert.equal(a.workCooldown, 0);
  assert.equal(b.life, 31); assert.equal(b.hp, 22); assert.notEqual(a.x, b.x);
  const before = structuredClone(g.state.workers);
  for (const phase of ['paused', 'transition', 'upgrade', 'won', 'lost']) { g.state.phase = phase; updateWorkers(g, 10); assert.deepEqual(g.state.workers, before); }
  g.state.phase = 'playing'; for (const dt of [NaN, Infinity, -1, 0]) updateWorkers(g, dt); assert.deepEqual(g.state.workers, before);
});

test('Game integration consumes slow employment time during aiming and freezes only during pause or transition', () => {
  const { g } = setup();
  assert.equal(typeof g.hireWorker, 'function');
  assert.equal(g.hireWorker('lumberjack'), true);
  const worker = g.state.workers[0];
  g.update(.5); assert.ok(Math.abs(worker.life - 59.5) < 1e-7);
  const life = worker.life; assert.equal(g.beginAim(g.state.balls[0].id),true);const simulated=g.advanceAim(2);assert.ok(Math.abs(worker.life-(life-simulated))<1e-7);assert.ok(simulated>0&&simulated<2);g.cancelAim();
  const pausedLife=worker.life;g.togglePause(); g.update(5); assert.equal(worker.life, pausedLife);
  g.togglePause(); g.state.materials.obsidian = 10; assert.equal(g.buildPortal(), true); g.update(1.01);
  const beforePortal = worker.life; assert.equal(g.enterPortal(), true); g.update(1); assert.equal(worker.life, beforePortal);
  g.update(1.5); assert.equal(g.state.stage, 'nether'); assert.equal(worker.life, beforePortal);
  assert.ok(g.state.workers.includes(worker));
  g.start(); assert.equal(g.state.workers.length, 0); assert.equal(g.state.workerUpgrades.lumberjack.duration, 0);
});
