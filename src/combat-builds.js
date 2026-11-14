// Shared hit effects for blocks, inherited ghosts, beams and bounded secondary hits.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const BUILD_IDS = Object.freeze(['fire_aspect', 'frost_touch', 'stationary_turret', 'earthshatter', 'prism', 'gravity_mark']);

export function createHitContext() { return { remaining: 48, effects: new Set() }; }
const childMeta = meta => ({ buildContext: meta.buildContext, buildDepth: (meta.buildDepth || 0) + 1 });
const emit = (game, effect, enemy, radius, color, value) => game.onEvent({ type: 'buildEffect', effect, x: enemy.x, y: enemy.y, radius, color, value });

function ignite(game, enemy, ball, damage, level, generation = 0) {
  if (enemy.hp <= 0) return;
  const dps = 4 + level * 3 + Math.min(15, damage * 0.08);
  if (!(enemy.burnTimer > 0) || dps >= (enemy.burnDps || 0)) {
    enemy.burnDps = dps; enemy.burnSource = game._combatSnapshot(ball);
    enemy.burnGeneration = generation; enemy.burnLevel = level;
  }
  enemy.burnTimer = Math.max(enemy.burnTimer || 0, 3 + level * 1.2);
  enemy.burnTick ??= 0.5;
  enemy.burnSpreadCooldown ??= 1;
}

export function applyFrost(game, enemy, ball, damage, level, meta = {}) {
  if (enemy.hp <= 0 || level <= 0) return 0;
  const context = meta.buildContext || createHitContext();
  const key = `frost:${enemy.id}`;
  if (context.effects.has(key)) return 0;
  context.effects.add(key);
  enemy.frostStacks = (enemy.frostTimer > 0 ? enemy.frostStacks || 0 : 0) + 1;
  enemy.frostTimer = 4 + level * 0.7;
  enemy.slowTimer = Math.max(enemy.slowTimer || 0, enemy.frostTimer);
  if (enemy.frostStacks < 3) return 0;
  enemy.frostStacks = 0;
  meta.frostShatter = true;
  const bonus = damage * 0.85 + level * 12;
  emit(game, 'frostBurst', enemy, 85, '#a5e7ff', bonus);
  return bonus;
}

export function prepareHit(game, enemy, amount, ball, meta) {
  if (!ball || meta.noBuildTriggers || !(amount > 0)) return amount;
  meta.buildContext ||= createHitContext();
  if (meta.buildContext.remaining <= 0) { meta.noBuildTriggers = true; return amount; }
  meta.buildContext.remaining -= 1;
  const fire = game._level('fire_aspect', ball);
  if (fire || game._isBurning(ball) || ball.shotRod === 'blaze') ignite(game, enemy, ball, amount, Math.max(1, fire));
  const frost = game._level('frost_touch', ball) + (game._combatTraits(ball).includes('frost') ? Math.max(1, game.state.upgrades.frost || 0) : 0);
  const bonus = applyFrost(game, enemy, ball, amount, frost, meta);
  const gravity = game._level('gravity_mark', ball);
  if (gravity > 0) {
    const fresh = !(enemy.gravityTimer > 0);
    enemy.gravityTimer = Math.max(enemy.gravityTimer || 0, 3 + gravity * 0.7);
    enemy.gravityLevel = Math.max(enemy.gravityLevel || 0, gravity);
    enemy.gravityDamage = Math.max(enemy.gravityDamage || 0, amount * (0.35 + gravity * 0.1));
    enemy.gravitySource = game._combatSnapshot(ball);
    if (fresh) emit(game, 'gravityMark', enemy, 100 + gravity * 15, '#c4a5ff');
  }
  return amount + bonus;
}

export function afterHit(game, enemy, damage, ball, meta) {
  if (!ball || meta.noBuildTriggers || !meta.buildContext || meta.buildContext.remaining <= 0 || (meta.buildDepth || 0) >= 2) return;
  const next = childMeta(meta);
  const source = { ...ball, x: enemy.x, y: enemy.y };
  if (meta.source !== 'lightning') game._element(source, damage, next);
  const earth = game._level('earthshatter', ball);
  if (earth && game._buildReady(`earth:${ball.id}`, 0.65)) {
    const radius = 75 + earth * 14;
    emit(game, 'quake', enemy, radius, '#d7b38a', damage * (0.28 + earth * 0.08));
    for (const target of game.state.enemies) if (target.hp > 0 && distance(target, enemy) <= radius) target.quakeSlowTimer = Math.max(target.quakeSlowTimer || 0, 1 + earth * 0.2);
    game._areaDamage(enemy.x, enemy.y, radius, damage * (0.28 + earth * 0.08), '#d7b38a', 'earthshatter', 12, ball, 'player', next);
  }
  if (meta.frostShatter) game._areaDamage(enemy.x, enemy.y, 85, damage * 0.25, '#a5e7ff', 'frost_shatter', 10, ball, 'player', next);
  const wasSlowed = enemy.slowTimer > 0 || enemy.quakeSlowTimer > 0;
  if (wasSlowed && game._level('storm_link', ball) && game._enchantCooldowns.storm <= 0) {
    game._enchantCooldowns.storm = 0.8;
    game._lightning(source, damage * 0.8, game._level('storm_link', ball), next);
  }
  if (wasSlowed && game._isBurning(ball) && game._level('steam_burst', ball) && game._enchantCooldowns.steam <= 0) {
    game._enchantCooldowns.steam = 1.1;
    game._areaDamage(enemy.x, enemy.y, 100 + game._level('steam_burst', ball) * 20, damage * (0.6 + game._level('steam_burst', ball) * 0.2), '#e9b9ff', 'steam', 14, ball, 'player', next);
  }
  const blaze = ball.shotRod === 'blaze';
  if ((blaze || game._isBurning(ball)) && game._flameCooldown <= 0) {
    game._flameCooldown = blaze ? 0.45 : 0.9;
    game._areaDamage(enemy.x, enemy.y, blaze ? 115 : 85, damage * (blaze ? 0.65 : 0.3), '#ff9b45', blaze ? 'rod' : 'fire', blaze ? 12 : 8, ball, 'player', next);
  }
}

export function onDeath(game, enemy, meta = {}) {
  if (!(enemy.gravityTimer > 0) || enemy.gravityCollapsed) return;
  enemy.gravityCollapsed = true;
  const radius = 100 + (enemy.gravityLevel || 1) * 15;
  emit(game, 'gravityCollapse', enemy, radius, '#a78bfa', enemy.gravityDamage || 15);
  const context = meta.buildContext || createHitContext();
  if (context.remaining <= 0 || (meta.buildDepth || 0) >= 2) return;
  game._areaDamage(enemy.x, enemy.y, radius, Math.min(500, enemy.gravityDamage || 15), '#a78bfa', 'gravity_collapse', 14, enemy.gravitySource, 'player', { buildContext: context, buildDepth: (meta.buildDepth || 0) + 1 });
}

export function updateCombat(game, dt) {
  const enemies = game.state.enemies;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    enemy.quakeSlowTimer = Math.max(0, (enemy.quakeSlowTimer || 0) - dt);
    enemy.frostTimer = Math.max(0, (enemy.frostTimer || 0) - dt);
    if (enemy.frostTimer <= 0) enemy.frostStacks = 0;
    enemy.gravityTimer = Math.max(0, (enemy.gravityTimer || 0) - dt);
    if (enemy.gravityTimer > 0) {
      enemy.gravityPullCooldown = (enemy.gravityPullCooldown || 0) - dt;
      if (enemy.gravityPullCooldown <= 0) {
        enemy.gravityPullCooldown = 0.12;
        const radius = 100 + (enemy.gravityLevel || 1) * 15;
        const targets = enemies.filter(target => target !== enemy && target.hp > 0 && distance(target, enemy) < radius).slice(0, 12);
        for (const target of targets) {
          const angle = Math.atan2(enemy.y - target.y, enemy.x - target.x);
          const impulse = ['boss', 'wither', 'warden', 'dragon'].includes(target.kind) ? 6 : 22 + (enemy.gravityLevel || 1) * 5;
          target.vx += Math.cos(angle) * impulse; target.vy += Math.sin(angle) * impulse;
          game._limit(target, 650); game._containEnemy(target);
        }
      }
    }
    if (!(enemy.burnTimer > 0)) continue;
    enemy.burnTimer = Math.max(0, enemy.burnTimer - dt);
    enemy.burnTick = (enemy.burnTick ?? 0.5) - dt;
    enemy.burnSpreadCooldown = (enemy.burnSpreadCooldown ?? 1) - dt;
    if (enemy.burnSpreadCooldown <= 0 && (enemy.burnGeneration || 0) < 2) {
      enemy.burnSpreadCooldown = 1;
      const radius = 55 + (enemy.burnLevel || 1) * 10;
      const targets = enemies.filter(target => target !== enemy && target.hp > 0 && !(target.burnTimer > 0) && distance(target, enemy) < radius).slice(0, 2);
      for (const target of targets) ignite(game, target, enemy.burnSource, 0, enemy.burnLevel || 1, (enemy.burnGeneration || 0) + 1);
      if (targets.length) emit(game, 'fireSpread', enemy, radius, '#ff9b45', targets.length);
    }
    if (enemy.burnTick <= 0) {
      enemy.burnTick += 0.5;
      game._damage(enemy, clamp(enemy.burnDps || 0, 0, 100) * 0.5 * game._fireMultiplier(), '#ff9b45', enemy.burnSource, 'player', { noBuildTriggers: true, burning: true, source: 'burn_dot' });
    }
  }
}
