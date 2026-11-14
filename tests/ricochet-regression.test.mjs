import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WORLD, describeRicochet } from '../src/core.js';

function setup() {
  const g = new Game({ random: () => .99 }); g.start();
  g.state.resources = []; g._spawnTimer = Infinity; g._treeTimer = Infinity; g._oreTimer = Infinity;
  return g;
}
function ball(g, type, enchantments = {}) {
  const b = g._newBall(type, 800, 600); b.enchantments = { ...enchantments }; g.state.balls.push(b); return b;
}
function collide(g, a, b, speed = 800, advance = .2) {
  g.state.elapsed += advance;
  Object.assign(a, { x: 150, y: 150, vx: speed, vy: 0 });
  Object.assign(b, { x: 150 + a.r + b.r - 1, y: 150, vx: 150, vy: 0 });
  g._ballPair(a, b);
}
function wall(g, b) {
  g.state.elapsed += .2;
  Object.assign(b, { x: WORLD.margin + b.r - 1, y: 120, vx: -600, vy: 0 });
  g._ballWalls(b);
}
function permanent(b) {
  return structuredClone({ type: b.type, traits: b.traits, enchantments: b.enchantments, shotRod: b.shotRod, shotEnchantments: b.shotEnchantments, r: b.r, mass: b.mass, fusionLevel: b.fusionLevel });
}

test('joining AB and CD synchronizes all four participants without changing permanent blocks', () => {
  const g = setup(), a = g.state.balls[0], b = ball(g, 'storm', { crit: 2 }), c = ball(g, 'frost', { power: 3 }), d = ball(g, 'iron', { knockback: 4 });
  a.enchantments = { power: 1 };
  const members = [a, b, c, d], original = members.map(permanent);
  collide(g, a, b); collide(g, c, d); collide(g, b, c);
  members.forEach((member, index) => {
    const info = describeRicochet(member);
    assert.equal(info.active, true);
    assert.deepEqual(new Set(info.participants), new Set(members.map(b => b.id)));
    assert.deepEqual(new Set(info.traits), new Set(['iron', 'storm', 'frost']));
    assert.equal(info.enchantments.power, 3);
    assert.equal(info.enchantments.crit, 2);
    assert.equal(info.enchantments.knockback, 4);
    assert.equal(g._level('power', member), 3, 'same-name block enchantments take the maximum, not their sum');
    assert.deepEqual(permanent(member), original[index]);
  });
  assert.deepEqual(members.map(b => describeRicochet(b).count), [1, 2, 2, 1], 'each block counts only its own collisions');
});

test('repeat physical collisions grow counts but never duplicate inherited members or enchantment levels', () => {
  const g = setup(), a = g.state.balls[0], b = ball(g, 'storm', { power: 3, ricochet: 2 });
  a.enchantments = { power: 1 };
  for (let i = 0; i < 8; i++) collide(g, a, b);
  for (const member of [a, b]) {
    const info = describeRicochet(member);
    assert.equal(info.count, 8);
    assert.equal(info.participants.length, 2);
    assert.equal(info.enchantments.power, 3);
    assert.equal(info.enchantments.ricochet, 2);
    assert.equal(g._level('power', member), 3);
    assert.equal(g._level('ricochet', member), 2);
    assert.ok(info.multiplier > 1);
  }
});

test('a fresh shot stays detached from old teammates until another real block collision', () => {
  const g = setup(), a = g.state.balls[0], b = ball(g, 'storm'), c = ball(g, 'frost');
  collide(g, a, b); collide(g, b, c);
  assert.ok(describeRicochet(a).traits.includes('frost'));
  assert.equal(g.shoot(0, 1, a.id), true);
  Object.assign(a, { x: 800, y: 600 });
  assert.equal(describeRicochet(a).active, false);
  wall(g, b); collide(g, b, c);
  assert.equal(describeRicochet(a).active, false);
  assert.deepEqual(describeRicochet(a).traits, []);
  assert.equal(a.charge, 0);
  collide(g, a, b);
  assert.equal(describeRicochet(a).count, 1);
  assert.ok(describeRicochet(a).traits.includes('storm'));
  assert.ok(describeRicochet(a).traits.includes('frost'));
});

test('collision shares block effects while rod identity and rod enchantment snapshots remain private', () => {
  const g = setup(), a = g.state.balls[0], b = ball(g, 'storm', { power: 2 });
  g.state.ownedRods.push('blaze');
  g.state.rodEnchantments.wood = { power: 1 }; g.state.rodEnchantments.blaze = { power: 4 };
  assert.equal(g.shoot(0, 1, a.id), true); assert.equal(g.beginAim(a.id), true); g.advanceAim(1); g.cancelAim();
  assert.equal(g.equipRod('blaze'), true); assert.equal(g.shoot(0, 1, b.id), true);
  collide(g, a, b);
  assert.equal(a.shotRod, 'wood'); assert.equal(b.shotRod, 'blaze');
  assert.deepEqual(a.shotEnchantments, { power: 1 }); assert.deepEqual(b.shotEnchantments, { power: 4 });
  assert.equal(g._level('power', a), 3); assert.equal(g._level('power', b), 6);
  assert.equal(describeRicochet(a).enchantments.power, 2);
});

test('stopping every member clears temporary effects and releases the chain registry', () => {
  const g = setup(), a = g.state.balls[0], b = ball(g, 'storm', { power: 3 });
  collide(g, a, b);
  Object.assign(a, { x: 100, y: 150, vx: 0, vy: 0 }); Object.assign(b, { x: 800, y: 600, vx: 0, vy: 0 });
  g.update(.01);
  for (const member of [a, b]) {
    assert.equal(describeRicochet(member).count, 0);
    assert.deepEqual(describeRicochet(member).participants, []);
    assert.deepEqual(describeRicochet(member).enchantments, {});
    assert.equal(member.charge, 0);
  }
  assert.deepEqual(a.traits, []); assert.deepEqual(b.traits, ['storm']);
  assert.equal(g._level('power', a), 0); assert.equal(g._level('power', b), 3);
  assert.equal(g._ricochetChains.size, 0);
});

test('recall, ender-pearl teleport and capture immediately detach a block from its old chain', () => {
  for (const action of ['recall', 'teleport', 'capture']) {
    const g = setup(), a = g.state.balls[0], b = ball(g, 'storm', { power: 2 });
    collide(g, a, b);
    if (action === 'recall') assert.equal(g.recall(), true);
    if (action === 'teleport') { g.state.items.ender_pearl = 1; assert.equal(g.useItem('ender_pearl', 700, 500, a.id), true); }
    if (action === 'capture') {
      Object.assign(a, { x: 150, y: 150 }); Object.assign(b, { x: 800, y: 600 });
      const holder = g._spawnEnemy('enderman', { x: 180, y: 150, speed: 0 });
      g._endermanAI(holder, .01); assert.equal(a.heldBy, holder.id);
    }
    assert.equal(describeRicochet(a).active, false, action);
    assert.equal(g._level('power', a), 0, action);
    wall(g, b);
    assert.equal(describeRicochet(a).active, false, `${action} must prevent an old-chain update from reattaching it`);
  }
});

test('fusion only inherits permanent traits and affixes, never the borrowed chain state', () => {
  const g = setup(), a = g.state.balls[0], b = ball(g, 'storm', { power: 3 }), c = ball(g, 'frost', { crit: 1 });
  collide(g, a, b);
  assert.ok(describeRicochet(a).traits.includes('storm'));
  g.state.stations.anvil = true;
  assert.equal(g.fuseBlocks(a.id, c.id), true);
  assert.deepEqual(a.traits, ['frost']);
  assert.deepEqual(a.enchantments, { crit: 1 });
  assert.equal(describeRicochet(a).active, false);
  wall(g, b);
  assert.equal(describeRicochet(a).active, false);
  assert.equal(g._level('power', a), 0);
});

test('borrowed storm detonates TNT only at a qualifying impact and never transfers explosive identity', () => {
  for (const speed of [200, 1000]) {
    const g = setup(), a = g.state.balls[0], redstone = ball(g, 'storm'), tnt = ball(g, 'tnt');
    collide(g, a, redstone); Object.assign(redstone, { x: 900, y: 600 });
    assert.deepEqual(a.traits, []); assert.ok(describeRicochet(a).traits.includes('storm'));
    // The helper gives the other body 150 speed: 200-150 is below the 80 threshold.
    collide(g, a, tnt, speed);
    assert.equal(!!tnt.detonated, speed === 1000);
    assert.equal(a.type, 'cue'); assert.deepEqual(a.traits, []);
    assert.equal(describeRicochet(a).traits.includes('tnt'), false);
    assert.equal(describeRicochet(a).participants.includes(tnt.id), false);
    assert.equal(describeRicochet(tnt).active, false);
  }
});

test('wall corners and repeated overlap inside one contact window cannot manufacture extra bounce counts', () => {
  const g = setup(), a = g.state.balls[0];
  Object.assign(a, { x: WORLD.margin + a.r - 1, y: WORLD.margin + a.r - 1, vx: -500, vy: -500 });
  g._ballWalls(a);
  assert.equal(describeRicochet(a).count, 1);
  const b = ball(g, 'frost'); collide(g, a, b);
  const count = describeRicochet(a).count;
  for (let i = 0; i < 5; i++) collide(g, a, b, 800, 0);
  assert.equal(describeRicochet(a).count, count);
});

test('bounce multiplier is applied exactly once to actual enemy and crystal damage', () => {
  for (const targetKind of ['enemy', 'crystal']) {
    const g = setup(), a = g.state.balls[0];
    g.state.ownedRods.push('bone'); g.equipRod('bone');
    g.state.upgrades.power = 2; a.enchantments = { power: 1, ricochet: 2 }; a.fusionLevel = 1; a.traits = ['iron'];
    assert.equal(g.shoot(0, 1, a.id), true);
    for (let bounce = 0; bounce < 3; bounce++) wall(g, a);
    const equipmentMultiplier = (1 + 3 * .24) * 1.2 * 1.25 * 1.35;
    const before = describeRicochet(a);
    assert.ok(Math.abs(g._impactMultiplier(a) / equipmentMultiplier - before.multiplier) < 1e-9);
    let multiplierAtHit;
    g.onEvent = event => { if (event.type === 'hit') multiplierAtHit = describeRicochet(a).multiplier; };
    Object.assign(a, { x: 150, y: 150, vx: 1000, vy: 0 });
    if (targetKind === 'enemy') {
      const enemy = { id: 9999, kind: 'zombie', x: 150 + a.r + 15 - 1, y: 150, r: 15, vx: 0, vy: 0, hp: 100000, maxHp: 100000, speed: 0 };
      g.state.enemies = [enemy]; g._ballEnemy(a, enemy);
      assert.ok(Math.abs((100000 - enemy.hp) - 40 * equipmentMultiplier * multiplierAtHit) < 1e-8);
    } else {
      const crystal = { id: 9999, x: 150 + a.r + 24 - 1, y: 150, r: 24, shield: 100000, maxShield: 100000, hp: 100, maxHp: 100 };
      g.state.crystals = [crystal]; g._ballCrystal(a, crystal);
      assert.ok(Math.abs((100000 - crystal.shield) - 40 * equipmentMultiplier * multiplierAtHit) < 1e-8);
    }
  }
});

test('an elemental damage input already containing bounce amplification is not multiplied again', () => {
  const g = setup(), a = g.state.balls[0], b = ball(g, 'storm', { power: 3 });
  collide(g, a, b); wall(g, a); g.state.elapsed += 1;
  const target = { id: 9999, kind: 'zombie', x: a.x + 50, y: a.y + 30, r: 15, hp: 1000, maxHp: 1000, vx: 0, vy: 0, speed: 0 };
  g.state.enemies = [target];
  g._element(a, 100);
  assert.equal(target.hp, 955, 'rank-one storm converts the supplied damage to 45%, with no extra bounce factor');
});

test('describeRicochet returns detached snapshots and a safe empty record for absent balls', () => {
  assert.deepEqual(describeRicochet(null), { active: false, count: 0, damageBonus: 0, baseBonus: 0, multiplier: 1, participants: [], traits: [], enchantments: {}, fireTimer: 0, burning: false });
  const g = setup(), a = g.state.balls[0], b = ball(g, 'storm', { power: 2 }); collide(g, a, b);
  const description = describeRicochet(a); description.traits.push('gold'); description.participants.push(9999); description.enchantments.power = 9999;
  const fresh = describeRicochet(a);
  assert.equal(fresh.traits.includes('gold'), false); assert.equal(fresh.participants.includes(9999), false); assert.equal(fresh.enchantments.power, 2);
});

test('legal elasticity books improve wall and block speed retention while caps and friction still stop every block', () => {
  function trial(enchanted) {
    const g = setup(), a = g.state.balls[0], b = ball(g, 'cue');
    if (enchanted) {
      g.state.stations.anvil = true; g.state.books.elasticity = 4; g.state.xp = 12;
      for (let i = 0; i < 4; i++) assert.equal(g.enchant({ kind: 'ball', id: a.id }, 'book', 'elasticity'), true);
      assert.equal(a.enchantments.elasticity, 4); assert.equal(g.state.books.elasticity, 0); assert.equal(g.state.xp, 0);
    }
    wall(g, a);
    const wallSpeed = Math.hypot(a.vx, a.vy);
    g._clearRicochet(a);
    Object.assign(a, { x: 150, y: 150, vx: 600, vy: 0 }); Object.assign(b, { x: 150 + a.r + b.r - 1, y: 150, vx: 0, vy: 0 });
    g.state.elapsed += .2; g._ballPair(a, b);
    const transferSpeed = Math.hypot(b.vx, b.vy);
    a.vx = 100000; g.update(.001);
    assert.ok(g.state.balls.every(ball => Math.hypot(ball.vx, ball.vy) <= 1250));
    g.update(8);
    for (const member of g.state.balls) {
      assert.equal(member.vx, 0); assert.equal(member.vy, 0);
      assert.equal(describeRicochet(member).active, false);
    }
    return { wallSpeed, transferSpeed };
  }
  const plain = trial(false), elastic = trial(true);
  assert.ok(elastic.wallSpeed > plain.wallSpeed);
  assert.ok(elastic.transferSpeed > plain.transferSpeed);
});

test('borrowed Fire Aspect explodes on impact without writing native fire timers or renewing on repeat contacts', () => {
  const g = setup(), events = [], a = g.state.balls[0], b = ball(g, 'iron', { fire_aspect: 2 });
  g.onEvent = event => events.push(event);
  collide(g, a, b);
  assert.ok(describeRicochet(a).fireTimer > 0);
  assert.equal(a.fireTimer || 0, 0); assert.equal(b.fireTimer || 0, 0);
  const direct = { id: 9998, kind: 'zombie', x: 150 + a.r + 15 - 1, y: 150, r: 15, vx: 0, vy: 0, hp: 1000, maxHp: 1000, speed: 0 };
  const nearby = { id: 9999, kind: 'zombie', x: 190, y: 225, r: 15, vx: 0, vy: 0, hp: 1000, maxHp: 1000, speed: 0 };
  g.state.enemies = [direct, nearby]; Object.assign(a, { x: 150, y: 150, vx: 1000, vy: 0 });
  g._ballEnemy(a, direct);
  assert.ok(events.some(event => event.type === 'pulse' && event.source === 'fire' && event.value > 0));
  assert.ok(nearby.hp < 1000);
  assert.equal(a.fireTimer || 0, 0);
  g.state.enemies = []; g.update(.2);
  const remaining = describeRicochet(a).fireTimer;
  assert.ok(remaining > 0);
  collide(g, a, b);
  assert.ok(describeRicochet(a).fireTimer <= remaining + 1e-9, 'the same shared Fire Aspect does not refill its lifetime');
  Object.assign(a, { x: 100, y: 100, vx: 0, vy: 0 }); Object.assign(b, { x: 800, y: 600, vx: 0, vy: 0 }); g.update(.01);
  assert.equal(describeRicochet(a).burning, false);
  assert.equal(describeRicochet(a).fireTimer, 0);
  assert.equal(a.fireTimer || 0, 0);
  assert.deepEqual(a.enchantments, {}); assert.deepEqual(b.enchantments, { fire_aspect: 2 });
});

test('realm transitions and new runs clear all temporary chains but retain permanent member traits', () => {
  const g = setup(), a = g.state.balls[0], b = ball(g, 'storm', { power: 2 });
  collide(g, a, b); const aId = a.id, bId = b.id;
  g._changeStage('nether');
  assert.equal(g._ricochetChains.size, 0);
  for (const member of g.state.balls) { assert.equal(describeRicochet(member).active, false); assert.equal(member.charge, 0); }
  assert.deepEqual(g.state.balls.find(member => member.id === aId).traits, []);
  assert.deepEqual(g.state.balls.find(member => member.id === bId).traits, ['storm']);
  assert.deepEqual(b.enchantments, { power: 2 });
  collide(g, a, b); assert.equal(describeRicochet(a).active, true);
  g.start();
  assert.equal(g._ricochetChains.size, 0);
  assert.equal(g.state.balls.length, 1);
  assert.equal(describeRicochet(g.state.balls[0]).active, false);
  assert.deepEqual(g.state.balls[0].traits, []);
  assert.deepEqual(g.state.balls[0].enchantments, {});
});

test('bounce count continues beyond thirty-two while legacy recall charge stays bounded', () => {
  const g = setup(), a = g.state.balls[0];
  for (let i = 0; i < 48; i++) wall(g, a);
  const info = describeRicochet(a);
  assert.equal(info.count, 48);
  assert.ok(info.multiplier > 1 + 32 * .08);
  assert.ok(a.charge >= 0 && a.charge <= 1);
  assert.equal(g.recall(), true);
  assert.equal(describeRicochet(a).count, 0);
});

test('a new shot can reconnect after slow aiming without inheriting the previous contact record', () => {
  const g = setup(), a = g.state.balls[0], b = ball(g, 'storm');
  assert.equal(g.shoot(0, 1, a.id), true);
  collide(g, a, b);
  const elapsed = g.state.elapsed;
  assert.equal(g.beginAim(a.id), true);
  const simulated=g.advanceAim(1);
  assert.ok(Math.abs(g.state.elapsed-elapsed-simulated)<1e-8);
  assert.ok(simulated>0&&simulated<1, 'aiming advances a nonzero slow world');
  assert.equal(g.shoot(0, 1, a.id), true);
  assert.equal(describeRicochet(a).active, false);
  // This is a real new strike, not repeated resolution of the previous contact.
  collide(g, a, b, 800, 0);
  assert.equal(describeRicochet(a).count, 1);
  assert.ok(describeRicochet(a).traits.includes('storm'));
});
