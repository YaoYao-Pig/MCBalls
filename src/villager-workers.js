// Independent worker simulation. Game owns resource damage/rewards, world time
// and stage transitions; this module deliberately does not import core.js.
const ROLES = Object.freeze({
  lumberjack: { name: '伐木村民', description: '自动寻找树木并采集木材；使用独立升级的斧。', resource: 'tree', speed: 44, interval: 1.05, hp: 45, hireCost: { wood: 4, stone: 2 }, suffix: '斧' },
  miner: { name: '采矿村民', description: '自动开采已落地矿物；低级镐开采硬矿较慢。', resource: 'ore', speed: 40, interval: 1.15, hp: 50, hireCost: { wood: 3, stone: 3 }, suffix: '镐' },
});
const TOOLS = ['wood', 'stone', 'iron', 'diamond', 'netherite'];
const TOOL_NAMES = ['木', '石', '铁', '钻石', '下界合金'];
const UPGRADE_NAMES = { speed: '移动速度', work: '采集效率', duration: '雇佣期限', tool: '工具升级' };
const LIMIT_PER_ROLE = 2, LIMIT_TOTAL = 4, BASE_LIFETIME = 60;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const validRole = role => Object.hasOwn(ROLES, role);
const rank = (value, max = 3) => clamp(Math.floor(finite(value)), 0, max);
const alive = worker => worker.hp > 0 && worker.life > 0 && !worker.departed;
const liveWorkers = game => (game.state.workers || []).filter(alive);

function upgradeRanks(game, role) {
  const values = game.state.workerUpgrades?.[role] || {};
  return { speed: rank(values.speed), work: rank(values.work), duration: rank(values.duration), tool: rank(values.tool, 4) };
}
function statsFor(game, role) {
  const profile = ROLES[role], levels = upgradeRanks(game, role);
  const beaconSpeed = 1 + rank(game.state.beacon?.upgrades?.mining_speed, 5) * .15;
  return {
    speed: profile.speed * (1 + levels.speed * .2),
    workInterval: Math.max(.24, profile.interval / ((1 + levels.work * .25) * beaconSpeed)),
    duration: BASE_LIFETIME + levels.duration * 20,
    toolLevel: levels.tool, tool: TOOLS[levels.tool], toolName: `${TOOL_NAMES[levels.tool]}${profile.suffix}`,
  };
}
function inventoryEnough(game, cost) {
  return Object.entries(cost).every(([id, value]) => finite(game.state.materials?.[id]) >= value);
}
function spend(game, cost) { for (const [id, value] of Object.entries(cost)) game.state.materials[id] -= value; }
function emit(game, event) { if (typeof game.onEvent === 'function') game.onEvent(event); }
function arena(game) {
  const world = game.world || game.WORLD || {};
  return { width: finite(world.width, 1000), height: finite(world.height, 720), margin: finite(world.margin, 30), baseRadius: finite(world.baseRadius, 42) };
}
function spawnPosition(game, role, index) {
  const world = arena(game);
  return { x: world.width / 2 + (role === 'lumberjack' ? -120 : 120), y: world.height / 2 + (index % 2 ? 62 : -62) };
}

export function initializeWorkers(game) {
  game.state.workers = [];
  game.state.workerUpgrades = {
    lumberjack: { speed: 0, work: 0, duration: 0, tool: 0 },
    miner: { speed: 0, work: 0, duration: 0, tool: 0 },
  };
  return game.state.workers;
}

export function canHireWorker(game, role) {
  if (!validRole(role)) return { ok: false, reason: '职业不存在', cost: {}, role };
  const cost = { ...ROLES[role].hireCost }, live = liveWorkers(game);
  const result = { ok: false, reason: '', cost, role, cap: LIMIT_PER_ROLE, duration: statsFor(game, role).duration };
  if (!['playing', 'paused'].includes(game.state.phase)) return { ...result, reason: '当前不能雇佣村民' };
  if (live.length >= LIMIT_TOTAL) return { ...result, reason: '最多同时雇佣四位采集村民' };
  if (live.filter(worker => worker.role === role).length >= LIMIT_PER_ROLE) return { ...result, reason: '这个职业最多同时两位村民' };
  if (!inventoryEnough(game, cost)) return { ...result, reason: '雇佣材料不足' };
  return { ...result, ok: true };
}

export function hireWorker(game, role) {
  const check = canHireWorker(game, role);
  if (!check.ok) return false;
  const stats = statsFor(game, role), profile = ROLES[role];
  const members = liveWorkers(game).filter(worker => worker.role === role);
  const worker = {
    id: game._id++, kind: 'villager', role, ...spawnPosition(game, role, members.length), r: 12, vx: 0, vy: 0,
    hp: profile.hp, maxHp: profile.hp, life: stats.duration, maxLife: stats.duration,
    tool: stats.tool, toolLevel: stats.toolLevel, targetId: null, workCooldown: 0, hurtCooldown: 0, flash: 0,
  };
  spend(game, check.cost);
  game.state.workers ||= []; game.state.workers.push(worker);
  emit(game, { type: 'workerHire', id: worker.id, role, name: profile.name, x: worker.x, y: worker.y, duration: worker.life });
  return true;
}

function upgradeCost(role, upgrade, next) {
  if (upgrade === 'tool') return [{ stone: 5, wood: 2 }, { iron: 4, wood: 3 }, { diamond: 3, iron: 2 }, { netheriteScrap: 2, gold: 2, iron: 2 }][next - 1] || {};
  if (upgrade === 'speed') return { wood: 1 + next * 2, stone: 2 + next, ...(next > 1 ? { iron: next - 1 } : {}) };
  if (upgrade === 'work') return { wood: 1 + next * 2, iron: 1 + next, ...(next === 3 ? { diamond: 1 } : {}) };
  return { wood: 2 + next * 2, stone: 2 + next * 2, ...(next > 1 ? { iron: next } : {}) };
}

export function canUpgradeWorker(game, role, upgrade) {
  if (!validRole(role) || !Object.hasOwn(UPGRADE_NAMES, upgrade)) return { ok: false, reason: '职业或升级项目不存在', role, upgrade, cost: {} };
  const maxLevel = upgrade === 'tool' ? 4 : 3, level = upgradeRanks(game, role)[upgrade], nextLevel = level + 1;
  const requiredBaseLevel = upgrade === 'tool' ? Math.max(1, nextLevel) : nextLevel;
  const result = { ok: false, reason: '', role, upgrade, level, nextLevel, maxLevel, requiredBaseLevel, cost: { ...upgradeCost(role, upgrade, nextLevel) } };
  if (!['playing', 'paused'].includes(game.state.phase)) return { ...result, reason: '当前不能升级村民' };
  if (level >= maxLevel) return { ...result, reason: '此项已经满级' };
  if (finite(game.state.beacon?.level, 1) < requiredBaseLevel) return { ...result, reason: `需要 ${requiredBaseLevel} 级信标` };
  if (!inventoryEnough(game, result.cost)) return { ...result, reason: '升级材料不足' };
  return { ...result, ok: true };
}

export function upgradeWorker(game, role, upgrade) {
  const check = canUpgradeWorker(game, role, upgrade);
  if (!check.ok) return false;
  spend(game, check.cost);
  game.state.workerUpgrades ||= {};
  game.state.workerUpgrades[role] = { ...upgradeRanks(game, role), [upgrade]: check.nextLevel };
  const stats = statsFor(game, role);
  for (const worker of liveWorkers(game)) if (worker.role === role) {
    if (upgrade === 'duration') { worker.life += 20; worker.maxLife += 20; }
    worker.tool = stats.tool; worker.toolLevel = stats.toolLevel;
    if (upgrade === 'work') worker.workCooldown = Math.min(worker.workCooldown, stats.workInterval);
  }
  emit(game, { type: 'workerUpgrade', role, upgrade, level: check.nextLevel, x: arena(game).width / 2, y: arena(game).height / 2 });
  return true;
}

export function getWorkerInfo(game) {
  const live = liveWorkers(game);
  return {
    totalCount: live.length, totalCap: LIMIT_TOTAL,
    roles: Object.entries(ROLES).map(([role, profile]) => {
      const stats = statsFor(game, role);
      return {
        role, name: profile.name, description: profile.description, count: live.filter(worker => worker.role === role).length,
        cap: LIMIT_PER_ROLE, stats, hire: canHireWorker(game, role),
        upgrades: Object.entries(UPGRADE_NAMES).map(([id, name]) => ({
          id, name: id === 'tool' ? `${profile.suffix}升级` : name, ...canUpgradeWorker(game, role, id),
          description: id === 'speed' ? '每级提高 20% 移速，影响当前与未来的本职业村民。'
            : id === 'work' ? '每级提高 25% 采集频率，与信标采集加成独立相乘。'
              : id === 'duration' ? '每级延长 20 战斗秒；在场同职业剩余时间也增加 20 秒。'
                : stats.toolLevel < 4 ? `下一工具：${TOOL_NAMES[stats.toolLevel + 1]}${profile.suffix}；不改变玩家工具。` : '工具已达到下界合金等级。',
        })),
      };
    }),
  };
}

function legalResource(game, worker, resource) {
  if (!resource || resource.kind !== ROLES[worker.role]?.resource || !(resource.hp > 0) || resource.fallTimer > 0 || !Number.isFinite(resource.x) || !Number.isFinite(resource.y) || !Number.isFinite(resource.r) || resource.r <= 0) return false;
  const world = arena(game), r = Math.max(0, finite(resource.r));
  return resource.x >= world.margin + r && resource.x <= world.width - world.margin - r && resource.y >= world.margin + r && resource.y <= world.height - world.margin - r;
}
function chooseResource(game, worker) {
  let selected = null, best = Infinity;
  for (const resource of game.state.resources || []) if (legalResource(game, worker, resource)) {
    const colleagues = (game.state.workers || []).filter(other => other.id !== worker.id && alive(other) && other.targetId === resource.id).length;
    const score = distance(worker, resource) + colleagues * 45;
    if (score < best) { best = score; selected = resource; }
  }
  return selected;
}

function moveToward(game, worker, target, speed, dt) {
  const world = arena(game), cx = world.width / 2, cy = world.height / 2;
  let dx = target.x - worker.x, dy = target.y - worker.y, length = Math.hypot(dx, dy);
  if (!length) return;
  const stopDistance = worker.r + target.r + 6;
  const travel = Math.min(speed * dt, Math.max(0, length - stopDistance));
  if (!travel) { worker.vx = worker.vy = 0; return; }
  // A tangent steering direction keeps workers out of the solid central base.
  const baseDistance = Math.hypot(worker.x - cx, worker.y - cy), reach = world.baseRadius + worker.r + 9;
  const toward = (cx - worker.x) * dx / length + (cy - worker.y) * dy / length;
  const crossDistance = Math.abs((cx - worker.x) * dy - (cy - worker.y) * dx) / length;
  if (toward > 0 && toward < length && crossDistance < reach && baseDistance < reach + 35) {
    const rx = worker.x - cx, ry = worker.y - cy;
    const side = rx * (target.y - cy) - ry * (target.x - cx) >= 0 ? 1 : -1;
    dx = -ry * side; dy = rx * side; length = Math.hypot(dx, dy) || 1;
  }
  worker.vx = dx / length * speed; worker.vy = dy / length * speed;
  worker.x += dx / length * travel; worker.y += dy / length * travel;
  const fromBase = Math.hypot(worker.x - cx, worker.y - cy);
  if (fromBase < reach) {
    const angle = Math.atan2(worker.y - cy, worker.x - cx);
    worker.x = cx + Math.cos(angle) * reach; worker.y = cy + Math.sin(angle) * reach;
  }
  worker.x = clamp(worker.x, world.margin + worker.r, world.width - world.margin - worker.r);
  worker.y = clamp(worker.y, world.margin + worker.r, world.height - world.margin - worker.r);
}

function leave(game, worker, reason) {
  if (worker.departed) return;
  worker.departed = true;
  worker.vx = worker.vy = 0; worker.targetId = null;
  emit(game, { type: 'workerLeave', id: worker.id, role: worker.role, reason, x: worker.x, y: worker.y });
}
function stepWorkers(game, dt) {
  for (const worker of game.state.workers || []) {
    if (!alive(worker)) { leave(game, worker, worker.hp <= 0 ? 'dead' : 'expired'); continue; }
    worker.life = Math.max(0, worker.life - dt);
    worker.workCooldown = Math.max(0, worker.workCooldown - dt);
    worker.hurtCooldown = Math.max(0, worker.hurtCooldown - dt);
    worker.flash = Math.max(0, worker.flash - dt);
    if (worker.life <= 1e-8) { worker.life = 0; leave(game, worker, 'expired'); continue; }
    if (worker.hurtCooldown <= 0) {
      const attackers = (game.state.enemies || []).filter(enemy => enemy.hp > 0 && !(enemy.kind === 'zombified_piglin' && !game.state.piglinAggro) && distance(worker, enemy) <= worker.r + enemy.r);
      if (attackers.length) {
        const damage = Math.max(...attackers.map(enemy => ['boss', 'wither', 'dragon', 'warden'].includes(enemy.kind) ? 9 : ['tank', 'shield_zombie', 'vindicator', 'piglin_brute'].includes(enemy.kind) ? 5 : 3));
        worker.hp = Math.max(0, worker.hp - damage); worker.hurtCooldown = .8; worker.flash = .15;
        emit(game, { type: 'workerHurt', id: worker.id, role: worker.role, x: worker.x, y: worker.y, value: damage });
        if (worker.hp <= 0) { leave(game, worker, 'dead'); continue; }
      }
    }
    const stats = statsFor(game, worker.role); worker.tool = stats.tool; worker.toolLevel = stats.toolLevel;
    let target = (game.state.resources || []).find(resource => resource.id === worker.targetId && legalResource(game, worker, resource));
    if (!target) target = chooseResource(game, worker);
    worker.targetId = target?.id ?? null;
    if (!target) { worker.vx = worker.vy = 0; continue; }
    const reach = worker.r + target.r + 8;
    if (distance(worker, target) > reach) { moveToward(game, worker, target, stats.speed, dt); continue; }
    worker.vx = worker.vy = 0;
    if (worker.workCooldown > 0) continue;
    const amount = game.getWorkerMiningDamage(worker, target);
    const damage = clamp(finite(amount, .5), .5, 100);
    worker.workCooldown = stats.workInterval;
    game._damageResource(target, damage, { source: 'worker', sourceWorkerId: worker.id, workerRole: worker.role, angle: Math.atan2(target.y - worker.y, target.x - worker.x), impactSpeed: 650 });
    emit(game, { type: 'workerWork', id: worker.id, role: worker.role, targetId: target.id, x: target.x, y: target.y, value: damage });
    if (target.hp <= 0) worker.targetId = null;
  }
  game.state.workers = (game.state.workers || []).filter(alive);
}

/** Feed battle simulation time only. Game.advanceAim must not call this: aiming,
 * ordinary pause and portal transitions therefore consume no employment time. */
export function updateWorkers(game, dt) {
  if (game.state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0 || !game.state.workers?.length) return;
  let remaining = dt;
  while (remaining > 1e-9 && game.state.phase === 'playing' && game.state.workers.length) {
    const step = Math.min(.1, remaining); stepWorkers(game, step); remaining -= step;
  }
}

export function relocateWorkers(game) {
  game.state.workers = liveWorkers(game);
  for (const role of Object.keys(ROLES)) {
    const stats = statsFor(game, role);
    game.state.workers.filter(worker => worker.role === role).forEach((worker, index) => {
      Object.assign(worker, spawnPosition(game, role, index), { vx: 0, vy: 0, targetId: null, workCooldown: 0, hurtCooldown: 0, flash: 0, tool: stats.tool, toolLevel: stats.toolLevel });
    });
  }
  return game.state.workers;
}
