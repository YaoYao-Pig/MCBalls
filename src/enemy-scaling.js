// Growth is based on the current realm's wave, never the global elapsed wave.
export const ENEMY_HEALTH_PER_WAVE = 0.12;
export const MAX_SCALING_WAVE = 1000;
const MAX_HEALTH = 1e9;

export function getEnemyScaling(stageWave = 1) {
  const requested = Number.isFinite(stageWave) ? Math.floor(stageWave) : 1;
  const wave = Math.min(MAX_SCALING_WAVE, Math.max(1, requested));
  const percent = (wave - 1) * 12;
  const hpMultiplier = 1 + percent / 100;
  const capped = requested >= MAX_SCALING_WAVE;
  return {
    wave,
    hpMultiplier,
    shieldMultiplier: hpMultiplier,
    percent,
    label: `第 ${wave} 波 · 新生怪物生命/护盾 ×${hpMultiplier.toFixed(2)}（+${percent}%）${capped ? ' · 已达安全上限' : ''}`,
  };
}

const finite = value => typeof value === 'number' && Number.isFinite(value);
const health = value => Math.min(MAX_HEALTH, Math.max(0, finite(value) ? value : 0));
const scaled = (value, multiplier) => multiplier === 1 ? health(value) : Math.round(health(health(value) * multiplier) * 1e6) / 1e6;

function scalePool(data, extra, currentKey, maxKey, multiplier) {
  const original = health(data[currentKey]);
  const originalMax = Math.max(original, health(finite(data[maxKey]) ? data[maxKey] : original));
  let maximum = scaled(originalMax, multiplier);
  let current = scaled(original, multiplier);
  const explicitCurrent = finite(extra[currentKey]);
  const explicitMaximum = finite(extra[maxKey]);
  if (explicitMaximum) {
    maximum = health(extra[maxKey]);
    // A max-only spawn override starts full; an injured/dead snapshot stays injured/dead.
    if (original > 0 && original === originalMax) current = maximum;
  }
  if (explicitCurrent) {
    current = health(extra[currentKey]);
    if (!explicitMaximum) maximum = Math.max(maximum, current);
  }
  return { [currentKey]: Math.min(current, maximum), [maxKey]: maximum };
}

/**
 * Return a new spawn record. Explicit extra.hp/maxHp/shield/maxShield are absolute
 * fixture overrides, not another scaling input. Metadata makes the operation
 * idempotent for existing enemies, preserving damage and their original wave.
 * Summoned/split children must use their kind/size's raw base stats, not a parent
 * record: each child receives exactly one multiplier for its own spawn wave.
 */
export function scaleEnemyStats(baseData = {}, stageWave = 1, extra = {}) {
  const data = baseData && typeof baseData === 'object' ? baseData : {};
  const overrides = extra && typeof extra === 'object' ? extra : {};
  const snapshot = finite(data.spawnWave) && finite(data.healthMultiplier) && finite(data.baseHp);
  const scaling = getEnemyScaling(snapshot ? data.spawnWave : stageWave);
  const multiplier = snapshot ? 1 : scaling.hpMultiplier;
  const result = {
    ...data,
    ...overrides,
    ...scalePool(data, overrides, 'hp', 'maxHp', multiplier),
    spawnWave: scaling.wave,
    healthMultiplier: snapshot ? data.healthMultiplier : scaling.hpMultiplier,
    baseHp: snapshot ? health(data.baseHp) : health(finite(data.maxHp) ? data.maxHp : data.hp),
    baseShield: snapshot ? health(data.baseShield) : health(finite(data.maxShield) ? data.maxShield : data.shield),
  };
  if ('shield' in data || 'maxShield' in data || 'shield' in overrides || 'maxShield' in overrides) {
    Object.assign(result, scalePool(data, overrides, 'shield', 'maxShield', multiplier));
  }
  return result;
}
