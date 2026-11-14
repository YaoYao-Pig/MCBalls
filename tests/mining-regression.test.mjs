import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, PICKAXES, MINING_MATERIALS, describeResource, describeRicochet } from '../src/core.js';

function isolated(random = () => 0.55, onEvent = () => {}) {
  const g = new Game({ random, onEvent });
  g.start();
  g.state.resources = [];
  g._spawnTimer = Infinity; g._treeTimer = Infinity; g._oreTimer = Infinity;
  return g;
}

function mine(material, tool) {
  const g = isolated(); g.state.pickaxe = tool;
  const ore = g._spawnResource('ore', 300, 150, material);
  const cue = g.state.balls[0];
  let hits = 0;
  while (ore.hp > 0 && hits < 240) {
    Object.assign(cue, { x: 248, y: 150, vx: 0, vy: 0 });
    assert.equal(g.beginAim(cue.id), true); g.advanceAim(1); g.cancelAim();
    assert.equal(g.shoot(0, 1, cue.id), true);
    const before = ore.hp;
    g.update(.06);
    assert.ok(ore.hp < before, `${tool} must always damage ${material}`);
    hits += 1;
  }
  assert.equal(ore.hp, 0);
  return { g, hits };
}

test('mining materials expose hardness guidance and a deliberately compressed gameplay durability ladder', () => {
  const order = ['wood', 'stone', 'iron', 'diamond', 'netherite', 'obsidian'];
  for (let i = 1; i < order.length; i += 1) assert.ok(MINING_MATERIALS[order[i]].maxHp > MINING_MATERIALS[order[i - 1]].maxHp);
  assert.equal(MINING_MATERIALS.obsidian.hardness, 50);
  assert.equal(MINING_MATERIALS.netherite.hardness, 30);
  assert.equal(describeResource({ kind: 'ore', material: 'obsidian' }).recommendedPickaxe, 'diamond');
  assert.equal(describeResource({ kind: 'tree' }).name, '树木');
  assert.equal(describeResource(null).material, null);
  for (const material of Object.values(MINING_MATERIALS)) assert.ok(material.blastResistance >= 0 && material.blastResistance < 1);
});

test('obsidian remains mineable by hand while iron, diamond and netherite dramatically reduce real collision counts', () => {
  const hits = PICKAXES.map(tool => mine('obsidian', tool.id).hits);
  for (let i = 1; i < hits.length; i += 1) assert.ok(hits[i] < hits[i - 1], `${PICKAXES[i].id} should be materially faster`);
  assert.ok(hits[0] > 70 && hits[0] < 180);
  assert.ok(hits[3] >= 8 && hits[3] <= 12);
  assert.ok(hits[4] >= 3 && hits[4] <= 5);
  assert.ok(hits[5] >= 1 && hits[5] <= 3);
  assert.ok(PICKAXES[5].hitCooldown < PICKAXES[3].hitCooldown);
  assert.equal(mine('obsidian', 'hand').g.state.materials.obsidian, 2, 'a recommended diamond pickaxe is not a loot gate');
});

test('ancient debris rewards later pickaxes without requiring one as a hard unlock', () => {
  const iron = mine('netherite', 'iron');
  const diamond = mine('netherite', 'diamond');
  const netherite = mine('netherite', 'netherite');
  assert.ok(iron.hits > diamond.hits && diamond.hits > netherite.hits);
  assert.equal(iron.g.state.materials.netheriteScrap, 2);
  assert.equal(mine('netherite', 'hand').g.state.materials.netheriteScrap, 2);
});

test('extreme combat power, fusion and ricochet cannot bypass mining tools', () => {
  const g = isolated(); const cue = g.state.balls[0];
  const ore = g._spawnResource('ore', 300, 150, 'obsidian');
  const plain = g._miningDamage(cue, ore, 1140);
  g.state.upgrades.power = 9999; g.state.upgrades.ricochet = 9999;
  cue.enchantments = { power: 9999, ricochet: 9999 };
  cue.fusionLevel = 3; cue.traits = ['iron'];
  g._recordRicochet(cue, 1140, 'fixture'); cue.ricochet.count = 1000000; g._refreshRicochet(cue);
  assert.ok(describeRicochet(cue).multiplier > 1000);
  const boosted = g._miningDamage(cue, ore, 1140);
  assert.ok(boosted > plain && boosted <= plain * 1.2 + 1e-9);
  assert.ok(boosted < ore.maxHp / 50, 'hand mining remains slow despite a huge combat build');
});

test('real TNT detonations respect mineral blast resistance and do not drop unbroken obsidian or debris', () => {
  for (const material of ['iron', 'diamond', 'netherite', 'obsidian']) {
    const events = []; const g = isolated(() => 0.55, event => events.push(event));
    const ore = g._spawnResource('ore', 400, 150, material);
    Object.assign(g.state.balls[0], { x: 900, y: 600 });
    const tnt = g._newBall('tnt', 300, 150); const redstone = g._newBall('storm', 240, 150);
    g.state.balls.push(tnt, redstone);
    g.shoot(0, 1, redstone.id); g.update(.1);
    assert.equal(tnt.detonated, true);
    assert.ok(ore.hp > 0 && ore.hp < ore.maxHp);
    const expectedDamage = 140 * (1 - MINING_MATERIALS[material].blastResistance);
    assert.ok(Math.abs(ore.maxHp - ore.hp - expectedDamage) < 1e-8);
    assert.equal(g.state.materials[material === 'netherite' ? 'netheriteScrap' : material], 0);
    const hit = events.find(event => event.type === 'hit' && event.target === 'resource');
    assert.equal(hit.explosive, true); assert.equal(hit.broken, false); assert.equal(hit.sourceBallId, tnt.id);
  }
});

test('Nether arrival melts existing snow golems once while preserving iron golem health', () => {
  const events = []; const g = isolated(() => 0.55, event => events.push(event));
  const snow = g._spawnAlly('snow_golem'); const iron = g._spawnAlly('iron_golem');
  snow.hp = 23; iron.hp = 77;
  g.state.materials.obsidian = 10; g.buildPortal(); g.state.portal.riseTimer = 0;
  assert.equal(g.enterPortal(), true);
  g.update(2.49); assert.ok(g.state.allies.includes(snow));
  g.update(.02);
  assert.equal(g.state.stage, 'nether');
  assert.ok(!g.state.allies.includes(snow)); assert.equal(snow.hp, 0);
  assert.ok(g.state.allies.includes(iron)); assert.equal(iron.hp, 77);
  const melts = events.filter(event => event.type === 'allyMelt');
  assert.equal(melts.length, 1); assert.equal(melts[0].kind, 'snow_golem'); assert.ok(melts[0].reason.includes('下界'));
  assert.ok(Number.isFinite(melts[0].x) && Number.isFinite(melts[0].y));
  g._spawnTimer = Infinity; g.update(.1);
  assert.equal(events.filter(event => event.type === 'allyMelt').length, 1);
});

test('Nether crafting and hiring reject snow golems atomically and direct spawning has a melting fallback', () => {
  const events = []; const g = isolated(() => 0.55, event => events.push(event)); g._changeStage('nether');
  Object.assign(g.state.materials, { wood: 100, stone: 100, iron: 100 });
  const before = structuredClone(g.state.materials);
  assert.equal(g.canCraft('snow_golem').ok, false); assert.ok(g.canCraft('snow_golem').reason.includes('高温'));
  assert.equal(g.craft('snow_golem'), false);
  assert.equal(g.canBuy('hire_snow_golem').ok, false); assert.ok(g.canBuy('hire_snow_golem').reason.includes('高温'));
  assert.equal(g.buyOffer('hire_snow_golem'), false);
  assert.deepEqual(g.state.materials, before);
  assert.equal(g._spawnAlly('snow_golem'), null);
  assert.equal(g.state.allies.filter(ally => ally.kind === 'snow_golem').length, 0);
  assert.equal(events.filter(event => event.type === 'allyMelt').length, 1);
  assert.equal(g.craft('iron_golem'), true);
  g._changeStage('return'); assert.equal(g.canCraft('snow_golem').ok, true);
});

test('resource hit metadata reports cracks and breakage without granting combo or experience', () => {
  const events = []; const g = isolated(() => 0.55, event => events.push(event));
  const tree = g._spawnResource('tree', 300, 150); const cue = g.state.balls[0];
  g.state.combo = 7; g.state.comboTimer = 100;
  Object.assign(cue, { x: 248, y: 150 }); g.shoot(0, 1); g.update(.06);
  const hit = events.find(event => event.type === 'hit' && event.target === 'resource');
  assert.ok(hit); assert.equal(hit.material, 'wood'); assert.equal(hit.kind, 'tree'); assert.equal(hit.combo, 0);
  assert.equal(hit.crit, false); assert.equal(hit.shield, false); assert.equal(hit.broken, false);
  assert.equal(hit.sourceBallId, cue.id); assert.ok(Number.isFinite(hit.angle)); assert.ok(hit.value > 0);
  assert.ok(tree.flash > 0 && tree.flash <= .12);
  g._updateResources(.2); assert.equal(tree.flash, 0);
  g._damageResource(tree, 1000, { sourceBall: cue });
  const broken = events.filter(event => event.type === 'hit' && event.target === 'resource').at(-1);
  assert.equal(broken.broken, true); assert.equal(tree.hp, 0);
  const count = events.length; g._damageResource(tree, 1000); assert.equal(events.length, count);
  assert.equal(g.state.combo, 7); assert.equal(g.state.xp, 0); assert.equal(g.state.totalXp, 0); assert.equal(g.state.pendingUpgrades, 0);
});

test('enemy hit events snapshot the incremented combo, actual crit, burning and shield state', () => {
  const events = []; const g = isolated(() => 0, event => events.push(event));
  const cue = g.state.balls[0]; Object.assign(cue, { x: 120, y: 150, fireTimer: 5 });
  const target = g._spawnEnemy('zombie', { x: 175, y: 150, hp: 1000, maxHp: 1000, speed: 0 });
  g.state.combo = 6; g.state.comboTimer = 100;
  g.shoot(0, 1); g.update(.05);
  const hit = events.find(event => event.type === 'hit' && event.target === 'enemy' && event.crit);
  assert.ok(target.hp < 1000); assert.ok(hit);
  assert.equal(hit.combo, 7); assert.equal(hit.burning, true); assert.equal(hit.shield, false); assert.equal(hit.kind, 'zombie');
  assert.equal(hit.sourceBallId, cue.id); assert.ok(Number.isFinite(hit.angle));
  g.state.combo = 99; assert.equal(hit.combo, 7);
  const shielded = g._spawnEnemy('shield_zombie', { x: 250, y: 150, shield: 1000, maxShield: 1000 });
  g._damage(shielded, 50, '#fff', cue, 'player', { crit: true, angle: 0 });
  const shieldHit = events.at(-1);
  assert.equal(shieldHit.target, 'enemy'); assert.equal(shieldHit.shield, true); assert.equal(shieldHit.shieldRemaining, 950); assert.equal(shieldHit.crit, true);
});

test('crystal hits identify shield impacts separately from resource mining', () => {
  const events = []; const g = isolated(() => 0.55, event => events.push(event)); g._changeStage('end');
  const crystal = g.state.crystals[0]; const cue = g.state.balls[0];
  g._damageCrystal(crystal, 20, cue, { angle: .5 });
  const hit = events.find(event => event.type === 'hit' && event.target === 'crystal');
  assert.equal(hit.material, 'obsidian'); assert.equal(hit.kind, 'end_crystal'); assert.equal(hit.shield, true);
  assert.equal(hit.shieldRemaining, 60); assert.equal(hit.combo, 0); assert.equal(hit.crit, false);
  assert.equal(hit.sourceBallId, cue.id); assert.equal(hit.angle, .5); assert.equal(hit.value, 20);
});
