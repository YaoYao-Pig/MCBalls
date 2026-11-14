import test from 'node:test';
import assert from 'node:assert/strict';
import { getEnemyScaling, scaleEnemyStats, MAX_SCALING_WAVE } from '../src/enemy-scaling.js';
import { Game } from '../src/core.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} should equal ${expected}`);
const game = () => {
  const result = new Game({ random: () => 0.55 });
  result.start();
  result._spawnTimer = Infinity;
  return result;
};

test('growth starts at one and increases by twelve percentage points beyond wave ten', () => {
  const first = getEnemyScaling(1);
  assert.equal(first.hpMultiplier, 1);
  assert.equal(first.shieldMultiplier, 1);
  assert.equal(first.percent, 0);
  close(getEnemyScaling(2).hpMultiplier, 1.12);
  close(getEnemyScaling(11).hpMultiplier, 2.2);
  close(getEnemyScaling(21).hpMultiplier, 3.4);
  assert.match(getEnemyScaling(11).label, /2\.20/);
  assert.match(getEnemyScaling(11).label, /生命\/护盾/);
});

test('malformed waves stay finite and the defensive cap is explicit', () => {
  for (const invalid of [undefined, null, NaN, Infinity, -Infinity, -10, 0, '5', {}]) {
    assert.equal(getEnemyScaling(invalid).wave, 1);
    assert.equal(getEnemyScaling(invalid).hpMultiplier, 1);
  }
  assert.equal(getEnemyScaling(3.9).wave, 3);
  const capped = getEnemyScaling(Number.MAX_SAFE_INTEGER);
  assert.equal(capped.wave, MAX_SCALING_WAVE);
  assert.ok(Number.isFinite(capped.hpMultiplier));
  assert.match(capped.label, /安全上限/);
});

test('one multiplier scales health and shields without mutating the base definition', () => {
  const base = { kind: 'shield_zombie', hp: 35, shield: 42, maxShield: 42, speed: 13 };
  const result = scaleEnemyStats(base, 6);
  assert.equal(result.hp, 56);
  assert.equal(result.maxHp, 56);
  assert.equal(result.shield, 67.2);
  assert.equal(result.maxShield, 67.2);
  assert.equal(result.baseHp, 35);
  assert.equal(result.baseShield, 42);
  assert.equal(result.spawnWave, 6);
  assert.equal(result.healthMultiplier, 1.6);
  assert.equal(result.speed, 13);
  assert.deepEqual(base, { kind: 'shield_zombie', hp: 35, shield: 42, maxShield: 42, speed: 13 });
});

test('absolute spawn overrides retain fixture values and consistent maximum health', () => {
  const injured = scaleEnemyStats({ hp: 23 }, 11, { hp: 1, x: 123, speed: 0 });
  assert.equal(injured.hp, 1);
  close(injured.maxHp, 50.6);
  assert.equal(injured.x, 123);
  assert.equal(injured.speed, 0);
  const giant = scaleEnemyStats({ hp: 23 }, 11, { hp: 10000 });
  assert.equal(giant.hp, 10000);
  assert.equal(giant.maxHp, 10000);
  const maxOnly = scaleEnemyStats({ hp: 23 }, 11, { maxHp: 300 });
  assert.equal(maxOnly.hp, 300);
  assert.equal(maxOnly.maxHp, 300);
  const both = scaleEnemyStats({ hp: 23, shield: 42 }, 11, { hp: 100, maxHp: 60, shield: 2, maxShield: 80 });
  assert.equal(both.hp, 60);
  assert.equal(both.maxHp, 60);
  assert.equal(both.shield, 2);
  assert.equal(both.maxShield, 80);
});

test('already spawned wounded enemies keep their birth wave and never scale twice', () => {
  const born = scaleEnemyStats({ hp: 23, shield: 42 }, 6);
  born.hp -= 11;
  born.shield -= 7;
  const cloned = scaleEnemyStats(born, 21);
  assert.notEqual(cloned, born);
  assert.deepEqual(cloned, born);
  assert.equal(cloned.spawnWave, 6);
  assert.equal(cloned.healthMultiplier, 1.6);
});

test('zero health and broken shields stay zero across scaling and higher maximum overrides', () => {
  const dead = scaleEnemyStats({ hp: 0, maxHp: 23, shield: 0, maxShield: 42 }, 11);
  assert.equal(dead.hp, 0);
  assert.equal(dead.shield, 0);
  const secondPass = scaleEnemyStats(dead, 21, { maxHp: 200, maxShield: 200 });
  assert.equal(secondPass.hp, 0);
  assert.equal(secondPass.shield, 0);
  const explicitDead = scaleEnemyStats({ hp: 23 }, 21, { hp: 0 });
  assert.equal(explicitDead.hp, 0);
});

test('invalid health data and very large inputs never create NaN or infinite health', () => {
  for (const hp of [NaN, Infinity, -Infinity, -2, Number.MAX_VALUE]) {
    const result = scaleEnemyStats({ hp, shield: hp }, Number.MAX_VALUE, { maxHp: NaN, maxShield: Infinity });
    assert.ok(Number.isFinite(result.hp) && result.hp >= 0);
    assert.ok(Number.isFinite(result.maxHp) && result.maxHp >= result.hp);
    assert.ok(Number.isFinite(result.shield) && result.shield >= 0);
    assert.ok(Number.isFinite(result.maxShield) && result.maxShield >= result.shield);
  }
});

const BASE_HP = {
  zombie: 23, tank: 84, runner: 22, shield_zombie: 35,
  drowned: 28, husk: 34, trident_drowned: 40, evoker: 50, vex: 14,
  vindicator: 48, witch: 48, zombified_piglin: 40, piglin_brute: 100,
  magma_cube: 64, ghast: 78, slime: 58, enderman: 54, skeleton: 26,
  blaze: 58, creeper: 32, boss: 380, wither: 380, dragon: 650, warden: 900,
};

test('every normal species and boss preserves wave-one stats and scales exactly once later', () => {
  const g = game();
  for (const [kind, baseHp] of Object.entries(BASE_HP)) {
    g.state.stageWave = 1;
    const first = g._spawnEnemy(kind);
    assert.equal(first.hp, baseHp, `${kind} first-wave hp`);
    assert.equal(first.maxHp, baseHp);
    assert.equal(first.spawnWave, 1);
    g.state.stageWave = 11;
    const later = g._spawnEnemy(kind);
    close(later.hp, baseHp * 2.2);
    close(later.maxHp, later.hp);
    assert.equal(later.spawnWave, 11);
    assert.equal(later.healthMultiplier, 2.2);
    if (kind === 'shield_zombie') {
      assert.equal(first.shield, 42);
      close(later.shield, 92.4);
      assert.equal(later.maxShield, later.shield);
    }
  }
});

test('a new wave affects only new enemies, preserving existing damage and broken shields', () => {
  const g = game();
  const wounded = g._spawnEnemy('shield_zombie', { x: 150, y: 150, speed: 0 });
  g._damage(wounded, 45, '#fff');
  assert.equal(wounded.hp, 32);
  assert.equal(wounded.shield, 0);
  g.state.stageElapsed = 29.99;
  g.update(0.02);
  assert.equal(g.state.stageWave, 2);
  assert.equal(wounded.hp, 32);
  assert.equal(wounded.maxHp, 35);
  assert.equal(wounded.shield, 0);
  assert.equal(wounded.maxShield, 42);
  assert.equal(wounded.spawnWave, 1);
  const later = g._spawnEnemy('shield_zombie');
  close(later.hp, 39.2);
  close(later.shield, 47.04);
});

test('changing realm resets health growth despite a high global wave', () => {
  const g = game();
  g.state.wave = 37;
  g.state.elapsed = 1080;
  g.state.stageWave = 12;
  const prior = g._spawnEnemy('zombie');
  close(prior.hp, 23 * 2.32);
  g._changeStage('nether');
  assert.equal(g.state.stageWave, 1);
  assert.equal(g.state.wave, 37);
  const fresh = g._spawnEnemy('zombie');
  assert.equal(fresh.hp, 23);
  assert.equal(fresh.spawnWave, 1);
  assert.equal(fresh.healthMultiplier, 1);
  assert.equal(g.getEnemyScaling().hpMultiplier, 1);
});

test('slime and magma children use raw size stats once at the current spawn wave', () => {
  for (const [kind, middleHp, smallHp] of [['slime', 30, 12], ['magma_cube', 32, 14]]) {
    const g = game();
    g.state.stageWave = 6;
    const parent = g._spawnEnemy(kind, { x: 200, y: 200, size: 3 });
    g.state.stageWave = 11;
    g._damage(parent, parent.hp + 1, '#fff');
    const middle = g.state.enemies.filter(enemy => enemy.kind === kind && enemy.size === 2 && enemy.hp > 0);
    assert.equal(middle.length, 2);
    for (const child of middle) {
      close(child.hp, middleHp * 2.2);
      assert.equal(child.maxHp, child.hp);
      assert.equal(child.spawnWave, 11);
    }
    g._damage(middle[0], middle[0].hp + 1, '#fff');
    const small = g.state.enemies.filter(enemy => enemy.kind === kind && enemy.size === 1 && enemy.hp > 0);
    assert.equal(small.length, 2);
    for (const child of small) close(child.hp, smallHp * 2.2);
    assert.equal(parent.hp, 0);
    assert.equal(middle[0].hp, 0);
  }
});

test('evoker summons use the current wave once and never inherit caster health', () => {
  const g = game();
  g.state.stageWave = 6;
  const caster = g._spawnEnemy('evoker', { x: 200, y: 200, speed: 0, attackCooldown: 0 });
  g.state.stageWave = 11;
  g._updateEnemies(0.001);
  const summons = g.state.enemies.filter(enemy => enemy.kind === 'vex');
  assert.equal(summons.length, 2);
  for (const summon of summons) {
    close(summon.hp, 14 * 2.2);
    assert.equal(summon.hp, summon.maxHp);
    assert.equal(summon.spawnWave, 11);
    assert.equal(summon.summonerId, caster.id);
  }
  assert.equal(caster.hp, 80);
});

test('core spawn preserves absolute hp fixtures at high waves and cannot revive zero hp', () => {
  const g = game();
  g.state.stageWave = 20;
  const fixture = g._spawnEnemy('zombie', { hp: 10000, maxHp: 10000, speed: 0 });
  assert.equal(fixture.hp, 10000);
  assert.equal(fixture.maxHp, 10000);
  const dead = g._spawnEnemy('zombie', { hp: 0 });
  assert.equal(dead.hp, 0);
  g._spawnEnemy('zombie');
  assert.equal(g.state.enemies.includes(dead), false);
  assert.equal(dead.hp, 0);
});
