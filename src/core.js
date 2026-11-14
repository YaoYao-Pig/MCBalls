import * as Workers from './villager-workers.js';
import { getEnemyScaling, scaleEnemyStats } from './enemy-scaling.js';
import * as Combat from './combat-builds.js';
import { traceBeam, buildBeamPlan } from './beam-engine.js';
export { getEnemyScaling } from './enemy-scaling.js';

export const WORLD = Object.freeze({ width: 1000, height: 720, margin: 30, baseRadius: 42 });

export const BEACON_TIERS = Object.freeze([
  { level: 1, pyramidLayers: 0, maxHpBonus: 0, cost: {} },
  { level: 2, pyramidLayers: 1, maxHpBonus: 30, cost: { wood: 4, stone: 6, iron: 2 } },
  { level: 3, pyramidLayers: 2, maxHpBonus: 70, cost: { wood: 6, stone: 10, iron: 4, diamond: 1 } },
  { level: 4, pyramidLayers: 3, maxHpBonus: 120, cost: { stone: 14, iron: 8, gold: 3, diamond: 2 } },
  { level: 5, pyramidLayers: 4, maxHpBonus: 180, cost: { stone: 18, iron: 12, diamond: 4, netheriteScrap: 2 } },
]);

export const BEACON_UPGRADES = Object.freeze([
  { id: 'shield', name: '黑曜石护盾', description: '每级增加 30 点护盾上限，并补充新增护盾。', maxRank: 4, minLevel: 1, cost: { stone: 3, iron: 2, obsidian: 1 } },
  { id: 'regen', name: '生命再生', description: '每 10 秒恢复生命，每级恢复 6 点。', maxRank: 3, minLevel: 2, cost: { wood: 4, bone: 2 } },
  { id: 'pulse', name: '红石脉冲', description: '方块撞击信标触发范围伤害；冷却 2 秒，每级提高伤害与范围。', maxRank: 3, minLevel: 2, cost: { iron: 3, gunpowder: 2 } },
  { id: 'recall_burst', name: '回归震荡', description: '召回主方块释放脉冲，此前连击与弹射蓄能提高伤害。', maxRank: 3, minLevel: 2, cost: { iron: 3, endPearl: 1 } },
  { id: 'repair', name: '堡垒修缮', description: '每次提高 12 点生命上限，并恢复 38 点生命；重复修缮花费增加。', maxRank: 99, minLevel: 1, cost: { wood: 2, stone: 3 } },
  { id: 'base_ricochet', name: '信标弹射', description: '每次有效撞击信标，本轮弹射伤害每级额外增加 12%；停稳或重新击打后清除。', maxRank: 4, minLevel: 2, cost: { iron: 2, gold: 1 } },
  { id: 'haste', name: '急迫', description: '每级提高傀儡攻击频率 18%。', maxRank: 4, minLevel: 2, cost: { wood: 3, iron: 2 } },
  { id: 'mining_speed', name: '挖掘速度', description: '每级提高采集村民工作频率 15%，与职业工具和工作效率升级叠加。', maxRank: 5, minLevel: 1, cost: { wood: 3, stone: 3 } },
  { id: 'shock', name: '震撼', description: '敌人靠近时自动震波伤敌并弹开，升级提高范围与力度、缩短冷却。', maxRank: 3, minLevel: 3, cost: { iron: 4, gold: 2, gunpowder: 3 } },
]);

export const RODS = Object.freeze([
  { id: 'wood', name: '木棍', description: '轻巧快击：击球冷却缩短 15%。', texture: 'stick', index: 0 },
  { id: 'bone', name: '骨头', description: '重击：碰撞伤害提高 25%，击退提高 20%。', texture: 'bone', index: 1 },
  { id: 'end', name: '末地烛', description: '时缓：瞄准时世界以 15% 速度运行，比普通球杆更易观察弹道。', texture: 'end_rod', index: 2 },
  { id: 'blaze', name: '烈焰棒', description: '爆破：撞怪触发更强、更大的火焰爆炸。', texture: 'blaze_rod', index: 3 },
]);

export const PICKAXES = Object.freeze([
  { id: 'hand', name: '徒手', index: 0, multiplier: 0.32, hardMultiplier: 0.35, hitCooldown: 0.36 },
  { id: 'wood', name: '木镐', index: 1, multiplier: 0.65, hardMultiplier: 0.45, hitCooldown: 0.30 },
  { id: 'stone', name: '石镐', index: 2, multiplier: 1, hardMultiplier: 0.6, hitCooldown: 0.25 },
  { id: 'iron', name: '铁镐', index: 3, multiplier: 1.55, hardMultiplier: 0.85, hitCooldown: 0.20 },
  { id: 'diamond', name: '钻石镐', index: 4, multiplier: 2.65, hardMultiplier: 1.4, hitCooldown: 0.16 },
  { id: 'netherite', name: '下界合金镐', index: 5, multiplier: 3.6, hardMultiplier: 1.8, hitCooldown: 0.12 },
]);

// Hardness is reference information; HP and blast absorption are tuned for this game.
export const MINING_MATERIALS = Object.freeze(Object.fromEntries(Object.entries({
  wood: { name: '树木', hardness: 2, maxHp: 44, recommendedPickaxe: 'hand', blastResistance: 0 },
  stone: { name: '石头', hardness: 1.5, maxHp: 80, recommendedPickaxe: 'wood', blastResistance: 0.3 },
  iron: { name: '铁矿', hardness: 3, maxHp: 120, recommendedPickaxe: 'stone', blastResistance: 0.35 },
  gold: { name: '金矿', hardness: 3, maxHp: 120, recommendedPickaxe: 'stone', blastResistance: 0.35 },
  quartz: { name: '石英矿', hardness: 3, maxHp: 120, recommendedPickaxe: 'stone', blastResistance: 0.35 },
  diamond: { name: '钻石矿', hardness: 3, maxHp: 150, recommendedPickaxe: 'iron', blastResistance: 0.55 },
  endPearl: { name: '末影珍珠矿', hardness: 3, maxHp: 120, recommendedPickaxe: 'stone', blastResistance: 0.35 },
  netherite: { name: '远古残骸', hardness: 30, maxHp: 300, recommendedPickaxe: 'diamond', blastResistance: 0.92 },
  obsidian: { name: '黑曜石', hardness: 50, maxHp: 480, recommendedPickaxe: 'diamond', blastResistance: 0.98 },
}).map(([id, properties]) => [id, Object.freeze(properties)])));

export function describeResource(resource) {
  if (!resource) return { name: '未知资源', material: null, hardness: 0, maxHp: 0, recommendedPickaxe: 'hand', blastResistance: 0 };
  const material = resource.kind === 'tree' ? 'wood' : resource.material === 'netheriteScrap' ? 'netherite' : resource.material || 'iron';
  const info = MINING_MATERIALS[material] || MINING_MATERIALS.stone;
  return { ...info, material, maxHp: resource.maxHp ?? info.maxHp };
}

export const UPGRADES = Object.freeze([
  { id: 'rod', category: 'rod', craftOnly: true, name: '球杆进阶', description: '使用材料合成骨头、末地烛与烈焰棒。', icon: '↗', color: '#ffd48a', maxLevel: 3 },
  { id: 'power', category: 'rod', name: '重击', description: '方块碰撞伤害每级提高 24%。', icon: '✦', color: '#ffbd69', maxLevel: 5 },
  { id: 'charge', category: 'rod', name: '轻巧握把', description: '蓄力效率提高 30%，更短拖拽即可满力，连续击球间隔缩短。', icon: '↗', color: '#86efac', maxLevel: 4 },
  { id: 'knockback', category: 'rod', name: '动能传递', description: '击退提高 30%，让怪物撞向后排。', icon: '»', color: '#fb923c', maxLevel: 4 },
  { id: 'crit', category: 'rod', name: '致命一击', description: '暴击率提高 10%；暴击造成双倍伤害。', icon: '✧', color: '#fda4af', maxLevel: 4 },
  { id: 'echo', category: 'rod', name: '连击幻影', description: '每次击球额外发射继承元素的短命幽灵块；炮台模式增加光束，重复选择增加数量。', icon: '◌', color: '#c4b5fd', maxLevel: 3 },
  { id: 'iron', category: 'ball', name: '铁块', description: '加入一个重型铁块；再次选择强化其伤害与质量。', icon: '■', color: '#d5d9df', maxLevel: 3 },
  { id: 'storm', category: 'ball', name: '红石块', description: '加入红石块，碰撞触发连锁电流；再次选择强化连锁。', icon: 'ϟ', color: '#ff6b76', maxLevel: 3 },
  { id: 'frost', category: 'ball', name: '寒冰块', description: '加入寒冰块，命中叠加三段冰霜：缓速→冻伤→高伤碎冰；范围脉冲与光束均可传递冰霜。', icon: '❄', color: '#a5d7ff', maxLevel: 3 },
  { id: 'slime', category: 'ball', name: '粘液块', description: '加入高弹力粘液块，碰撞保留更多速度、滑行更久；粘液炮台的光束射程与反弹次数增加。', icon: '▣', color: '#8ce35a', maxLevel: 3 },
  { id: 'ricochet', category: 'rod', name: '弹射增幅', description: '每次有效反弹的基础伤害增幅为 8%，此附魔每级额外增加 6%。停稳或重新击打后重置。', icon: '↝', color: '#f0abfc', maxLevel: 4 },
  { id: 'elasticity', category: 'rod', name: '弹力', description: '提高碰撞后的速度保留，让方块能完成更多反弹；仍受地面摩擦与速度上限约束。', icon: '↔', color: '#a3e635', maxLevel: 4 },
  { id: 'time_dilation', category: 'rod', name: '时缓', description: '瞄准时世界速度每级再乘 80%，最低 6%；与末地烛的时缓效果叠加。', icon: '◷', color: '#d8b4fe', maxLevel: 4 },
  { id: 'shield', category: 'base', name: '黑曜石护盾', description: '护盾上限和当前护盾各增加 30 点，优先抵挡基地伤害。', icon: '▣', color: '#b9a0ff', maxLevel: 4 },
  { id: 'regen', category: 'base', name: '生命信标', description: '每 10 秒恢复 6 点基地生命；重复选择增加恢复量。', icon: '+', color: '#86efac', maxLevel: 3 },
  { id: 'pulse', category: 'base', name: '红石脉冲', description: '方块撞基地触发范围伤害，冷却 2 秒；可强化伤害和范围。', icon: '◎', color: '#5eead4', maxLevel: 3 },
  { id: 'repair', category: 'base', name: '堡垒加固', description: '基地生命上限每级提高 12 点；材料修缮另恢复 38 点生命。', icon: '+', color: '#6ee7b7', maxLevel: 99 },
  { id: 'frost_touch', category: 'rod', name: '冰霜触碰', description: '命中叠加冰霜：缓速→冻伤→高伤碎冰；冰火状态可同时存在。', synergy: '寒冰块、幻影与光束都能叠冰并触发引雷。', icon: '❄', color: '#a5d7ff', maxLevel: 3 },
  { id: 'fire_aspect', category: 'rod', name: '火焰附加', description: '点燃命中的敌人，持续灼烧并向附近敌人传染；不会清除冰霜。', synergy: '幻影、分叉光束与震波均继承点燃。', icon: '♨', color: '#ff9b45', maxLevel: 3 },
  { id: 'stationary_turret', category: 'ball', name: '原地炮台', description: '选择一个方块变为固定炮台，按住蓄力后发射反弹光束；再次选择可强化指定炮台。', icon: '⊕', color: '#f9d879', maxLevel: 3 },
  { id: 'earthshatter', category: 'rod', name: '裂地者', description: '命中触发范围震波与缓速，震波继承元素，冷却 0.65 秒。', icon: '✺', color: '#d7b38a', maxLevel: 3 },
  { id: 'prism', category: 'rod', name: '棱镜折射', description: '普通击球生成分叉幻影，炮台光束分叉；分支继承元素和方块附魔。', icon: '◇', color: '#f0abfc', maxLevel: 3 },
  { id: 'gravity_mark', category: 'rod', name: '引力印记', description: '命中标记敌人并聚拢附近目标；标记敌人死亡触发继承元素的塌缩爆炸。', icon: '◉', color: '#a78bfa', maxLevel: 3 },
  { id: 'storm_link', category: 'rod', name: '寒霜引雷', description: '命中已经减速的敌人触发小雷链；冷却 0.8 秒。', synergy: '雪球、冰霜触碰、寒冰块与雪傀儡均可提供减速。', icon: 'ϟ', color: '#67e8f9', maxLevel: 3 },
  { id: 'steam_burst', category: 'rod', name: '霜火爆破', description: '燃烧方块命中减速目标触发范围爆破，保留减速与冰霜；冷却 1.1 秒。', synergy: '把冰雷融合块点燃，一次碰撞同时引爆连锁。', icon: '✹', color: '#e9b9ff', maxLevel: 3 },
  { id: 'looting', category: 'rod', name: '战利品掠夺', description: '击杀有材料掉落的敌人，有 25% 概率额外各获得 1 份材料；每级叠加 25%。', synergy: '额外材料能持续锻造融合方块与道具。', icon: '◆', color: '#fbbf24', maxLevel: 3 },
  { id: 'recall_burst', category: 'base', name: '回归震荡', description: '召回主方块释放基地脉冲；此前连击和蓄能越多，伤害越高。', synergy: '弹射蓄能与连续命中能强化召回爆发。', icon: '◎', color: '#b9a0ff', maxLevel: 3 },
  { id: 'supply_building', category: 'supply', fallbackOnly: true, name: '建筑补给', description: '立即获得 5 份木材与 5 份石料。', icon: '▥', color: '#a3e635', maxLevel: Number.MAX_SAFE_INTEGER },
  { id: 'supply_iron', category: 'supply', fallbackOnly: true, name: '铁锭补给', description: '立即获得 3 份铁锭。', icon: '◆', color: '#d5d9df', maxLevel: Number.MAX_SAFE_INTEGER },
  { id: 'supply_book', category: 'supply', fallbackOnly: true, name: '装备附魔书', description: '立即获得一本随机球杆或方块附魔书。', icon: '▤', color: '#c4b5fd', maxLevel: Number.MAX_SAFE_INTEGER },
]);

export const RECIPES = Object.freeze([
  { id: 'bone_rod', name: '骨头球杆', description: '解锁并装备骨头：伤害 +25%、击退 +20%；旧杆保留。', cost: { bone: 3, wood: 2 }, kind: 'rod', rodLevel: 0, rodId: 'bone', requiresRod: 'wood' },
  { id: 'end_rod', name: '末地烛球杆', description: '需要已拥有骨头，解锁并装备末地烛：瞄准时世界减速至 15%。', cost: { endPearl: 2, bone: 3 }, kind: 'rod', rodLevel: 1, rodId: 'end', requiresRod: 'bone' },
  { id: 'blaze_rod', name: '烈焰球杆', description: '需要已拥有末地烛，解锁并装备烈焰棒：强化范围爆炸。', cost: { blazeRod: 2, wood: 2 }, kind: 'rod', rodLevel: 2, rodId: 'blaze', requiresRod: 'end' },
  { id: 'tnt', name: 'TNT方块', description: '锻造一个可击打的TNT方块，只有红石特性方块碰撞才能引爆；爆炸可采集资源，不伤基地与友军。', cost: { gunpowder: 3, wood: 1 }, kind: 'ball', ballType: 'tnt' },
  { id: 'potion', name: '治疗药水', description: '获得一瓶药水，使用后恢复 35 点基地生命。', cost: { bone: 2, stone: 2 }, kind: 'item' },
  { id: 'iron_block', name: '锻造铁块', description: '锻造一个独立铁块，可重复制作并用于融合。', cost: { iron: 3, stone: 2 }, kind: 'ball', ballType: 'iron' },
  { id: 'redstone_block', name: '锻造红石块', description: '锻造一个独立红石块，给融合方块带来雷链。', cost: { iron: 2, gunpowder: 2 }, kind: 'ball', ballType: 'storm' },
  { id: 'frost_block', name: '锻造寒冰块', description: '锻造一个独立寒冰块，给融合方块带来范围减速。', cost: { stone: 4, wood: 2 }, kind: 'ball', ballType: 'frost' },
  { id: 'slime_block', name: '锻造粘液块', description: '锻造高弹力粘液块，可融合、传递弹力，炮台模式增加光束反弹次数与射程。', cost: { slimeBall: 3, stone: 2 }, kind: 'ball', ballType: 'slime' },
  { id: 'iron_golem', name: '铁傀儡', description: '召唤近战铁傀儡，主动追击敌人；最多两只。', cost: { iron: 6, wood: 3 }, kind: 'ally' },
  { id: 'snow_golem', name: '雪傀儡', description: '召唤远程雪傀儡，雪弹造成伤害与减速；最多两只，进入下界会被高温融化。', cost: { stone: 3, wood: 3 }, kind: 'ally' },
  { id: 'snowball', name: '冰霜雪球', description: '投掷到指定位置，使范围内敌人减速 4 秒。', cost: { stone: 2, wood: 1 }, kind: 'item' },
  { id: 'fire_charge', name: '烈焰弹', description: '指定位置造成范围伤害，并点燃范围内的持久方块。', cost: { blazeRod: 1, gunpowder: 1 }, kind: 'item' },
  { id: 'ender_pearl', name: '末影珍珠', description: '将选定方块瞬移到指定位置；不能解救被抓方块。', cost: { endPearl: 1 }, kind: 'item' },
  { id: 'redstone_boost', name: '红石过载', description: '全局过载 10 秒，缩短击球及元素冷却。', cost: { iron: 1, stone: 3 }, kind: 'item' },
  { id: 'enchanting_table', name: '附魔台', description: '解锁花费经验重洗指定装备的随机附魔。', cost: { diamond: 2, wood: 4, stone: 3 }, kind: 'station', station: 'enchantingTable' },
  { id: 'anvil', name: '铁砧', description: '解锁增量附魔、使用附魔书与方块融合。', cost: { iron: 6, stone: 3 }, kind: 'station', station: 'anvil' },
  { id: 'gold_block', name: '锻造金块', description: '金块会吸引猪灵蛮兵，可融合并保留诱饵特性。', cost: { gold: 3, stone: 2 }, kind: 'ball', ballType: 'gold' },
  { id: 'lightning_rod', name: '避雷针', description: '获得一座可定点放置的避雷针，将雷击导向附近敌人。', cost: { iron: 3, gold: 1, wood: 2 }, kind: 'item' },
  { id: 'wood_pickaxe', name: '木镐', description: '需要徒手，显著提高采矿伤害。', cost: { wood: 3 }, kind: 'pickaxe', pickaxeId: 'wood', requiresPickaxe: 'hand' },
  { id: 'stone_pickaxe', name: '石镐', description: '需要木镐，提高采矿伤害并缩短命中间隔。', cost: { wood: 2, stone: 5 }, kind: 'pickaxe', pickaxeId: 'stone', requiresPickaxe: 'wood' },
  { id: 'iron_pickaxe', name: '铁镐', description: '需要石镐，更有效地开采黑曜石。', cost: { wood: 2, iron: 4 }, kind: 'pickaxe', pickaxeId: 'iron', requiresPickaxe: 'stone' },
  { id: 'diamond_pickaxe', name: '钻石镐', description: '需要铁镐，大幅提高开采效率。', cost: { wood: 2, diamond: 3 }, kind: 'pickaxe', pickaxeId: 'diamond', requiresPickaxe: 'iron' },
  { id: 'netherite_pickaxe', name: '下界合金镐', description: '需要钻石镐，最高级采矿工具。', cost: { iron: 2, gold: 3, netheriteScrap: 4 }, kind: 'pickaxe', pickaxeId: 'netherite', requiresPickaxe: 'diamond' },
]);

const CX = WORLD.width / 2;
const CY = WORLD.height / 2;
const MAX_BALLS = 18;
const MAX_ENEMIES = 120;
const MAX_SPEED = 1250;
const MAX_PROJECTILES = 160;
const MAX_RESOURCES = 10;
const BOSS_NAMES = { wither: '凋零', dragon: '末影龙', warden: '循声守卫' };
const BOSS_KINDS = new Set(['boss', 'wither', 'dragon', 'warden']);
const STEP = 1 / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const length = (x, y) => Math.hypot(x, y);
const COLORS = { cue: '#fff5d8', ghost: '#c4b5fd', iron: '#fbbf24', storm: '#67e8f9', frost: '#a5b4fc', gold: '#ffd54a', slime: '#8ce35a', tnt: '#ff765d' };
const TRAITS = ['iron', 'storm', 'frost', 'gold', 'slime'];
const traitsOf = ball => TRAITS.filter(trait => (ball?.traits || []).includes(trait) || ball?.type === trait);
const effectiveTraitsOf = ball => TRAITS.filter(trait => traitsOf(ball).includes(trait) || (ball?.combatTraits || []).includes(trait) || (ball?.ricochet?.traits || []).includes(trait));
const blockEnchantmentsOf = ball => {
  const merged = { ...(ball?.enchantments || {}) };
  for (const [id, level] of Object.entries(ball?.ricochet?.enchantments || {})) merged[id] = Math.max(merged[id] || 0, level);
  return merged;
};
const ENCHANT_POOLS = {
  rod: ['power', 'charge', 'knockback', 'crit', 'echo', 'fire_aspect', 'frost_touch', 'earthshatter', 'prism', 'gravity_mark', 'looting', 'elasticity', 'time_dilation'],
  ball: ['power', 'knockback', 'crit', 'ricochet', 'frost_touch', 'storm_link', 'steam_burst', 'fire_aspect', 'elasticity', 'stationary_turret', 'earthshatter', 'prism', 'gravity_mark'],
};
const BOOK_IDS = [...new Set(Object.values(ENCHANT_POOLS).flat())];
const FREE_UPGRADE_IDS = new Set(['power', 'charge', 'knockback', 'crit', 'echo', 'ricochet', 'iron', 'storm', 'frost', 'slime', ...Combat.BUILD_IDS, 'supply_building', 'supply_iron', 'supply_book']);

export function getSpawnProfile(elapsed = 0) {
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  if (t < 30) return { interval: 2.8, count: 1, eliteChance: 0, slimeChance: 0 };
  if (t < 60) return { interval: 2.4, count: 1, eliteChance: t >= 45 ? 0.1 : 0, slimeChance: 0.15 };
  if (t < 90) return { interval: 1.6, count: 1, eliteChance: t >= 75 ? 0.15 : 0.12, slimeChance: 0.18 };
  if (t < 150) return { interval: 1.8, count: 2, eliteChance: 0.18, slimeChance: 0.22 };
  if (t < 210) return { interval: 1.6, count: 3, eliteChance: 0.22, slimeChance: 0.23 };
  if (t < 270) return { interval: 1.3, count: 4, eliteChance: 0.23, slimeChance: 0.24 };
  return { interval: 1.25, count: 5, eliteChance: 0.24, slimeChance: 0.24 };
}

export function describeBall(ball) {
  if (!ball) return { name: '未知方块', description: '', traits: [], level: 0 };
  if (ball.type === 'tnt') return { name: 'TNT方块', description: '红石碰撞引爆 · 范围伤敌与采集资源 · 不可融合', traits: [], level: 0 };
  const traits = traitsOf(ball);
  const level = Math.min(3, ball.fusionLevel || 0);
  const key = traits.join('+');
  const names = { 'iron+storm+frost': '三相融合块', 'iron+storm': '雷霆铁块', 'iron+frost': '霜铸铁块', 'storm+frost': '霜雷方块', iron: '铁块', storm: '红石块', frost: '寒冰块', slime: '粘液块' };
  const base = names[key] || (traits.includes('slime') ? '粘液融合块' : traits.includes('gold') ? (traits.length > 1 ? '镀金融合块' : '金块') : ball.type === 'ghost' ? '幽灵方块' : '草方块');
  const name = level > 0 && traits.length <= 1 ? `强化${base}` : base;
  const effects = traits.map(trait => ({ iron: '铁质重击', storm: '连锁闪电', frost: '三段冰霜：缓速→冻伤→碎冰', gold: '吸引猪灵蛮兵', slime: '高弹力与持速 · 光束延程反弹' })[trait]);
  if (level > 0) effects.push(`融合伤害 +${level * 20}%`);
  return { name, description: effects.join(' · ') || '可自由击打和召回的主方块', traits, level };
}

export function describeRicochet(ball) {
  const record = ball?.ricochet;
  const active = Boolean(record && record.count > 0 && !ball.heldBy && !ball.detonated);
  const baseBonus = active && Number.isFinite(ball.beaconRicochetBonus) ? Math.max(0, ball.beaconRicochetBonus) : 0;
  const damageBonus = Math.min(Number.MAX_SAFE_INTEGER, (active && Number.isFinite(record.damageBonus) ? record.damageBonus : 0) + baseBonus);
  const fireTimer = active ? Math.max(0, record.fireTimer || 0) : 0;
  return {
    active, count: active ? record.count : 0, damageBonus, baseBonus, multiplier: Math.min(Number.MAX_SAFE_INTEGER, 1 + damageBonus),
    participants: active ? [...record.participantIds] : [], traits: active ? [...record.traits] : [],
    enchantments: active ? { ...record.enchantments } : {}, fireTimer, burning: Boolean((ball?.fireTimer || 0) > 0 || fireTimer > 0),
  };
}

export function describeCatch(ball) {
  const reward = ball?.catchBonus;
  const active = Boolean(reward && reward.damageBonus > 0 && !ball.heldBy && !ball.detonated);
  return {
    active, caughtSpeed: active ? reward.caughtSpeed : 0,
    damageBonus: active ? reward.damageBonus : 0, speedBonus: active ? reward.speedBonus : 0,
    multiplier: active ? 1 + reward.damageBonus : 1, streak: active ? reward.streak : 0,
    grade: active ? reward.grade : 'steady', precise: active ? Boolean(reward.precise) : false,
  };
}

/** DOM-free simulation. Time is expressed in seconds, coordinates in world pixels. */
export class Game {
  constructor({ random = Math.random, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.reset();
  }

  reset() {
    this._id = 1;
    this._shotCooldown = 0;
    this._flameCooldown = 0;
    this._safeTntExplosion = 0;
    this._spawnTimer = 2;
    this._treeTimer = 8;
    this._oreTimer = 12;
    this._oreCount = 0;
    this._lastStageWave = 1;
    this._netherSpawnCount = 0;
    this._stormTimer = 7;
    this._baseBurnTick = 1;
    this._bookOfferWave = 'overworld:1';
    this._totalXpThreshold = 5;
    this._levelStartXp = 0;
    this._offeredUpgrades = [];
    this._bossSpawned = false;
    this._bossDefeated = false;
    this._contacts = new Map();
    this._elements = new Map();
    this._buildCooldowns = new Map();
    this._ricochetChains = new Map();
    this._nextRicochetChain = 1;
    this._enchantCooldowns = { storm: 0, steam: 0 };
    this.state = {
      phase: 'ready', elapsed: 0, duration: null,
      stage: 'overworld', stageWave: 1, stageElapsed: 0, objective: '', portal: null, transition: null,
      enemyScaling: getEnemyScaling(1),
      weather: 'sunny', structures: [], crystals: [], piglinAggro: false, baseBurnTimer: 0, pickaxe: 'hand',
      hp: 120, maxHp: 120, score: 0, kills: 0, shots: 0,
      shield: 0, maxShield: 0, regenTimer: 10, pulseCooldown: 0,
      beacon: { level: 1, upgrades: {}, shockCooldown: 0 },
      level: 1, xp: 0, xpNext: 5, levelXp: 0, pendingUpgrades: 0, wave: 1,
      combo: 0, maxCombo: 0, comboTimer: 0, recallCooldown: 0,
      balls: [], enemies: [], upgrades: {}, choices: [], upgradeTarget: null,
      resources: [], projectiles: [], allies: [], beams: [], qte: null, aim: null,
      materials: { wood: 2, stone: 3, iron: 0, bone: 0, blazeRod: 0, blazePowder: 0, gunpowder: 0, endPearl: 0, diamond: 0, obsidian: 0, gold: 0, quartz: 0, netheriteScrap: 0, slimeBall: 0 },
      items: { potion: 0, snowball: 0, fire_charge: 0, ender_pearl: 0, redstone_boost: 0, lightning_rod: 0 }, bossesSpawned: [], bossesDefeated: [], bossIntro: null,
      ownedRods: ['wood'], activeRod: 'wood', overchargeTimer: 0,
      experienceOrbs: [], totalXp: 0, books: {}, bookOffers: [], shopOffers: [],
      stations: { enchantingTable: false, anvil: false },
      rodEnchantments: { wood: {}, bone: {}, end: {}, blaze: {} }, baseEnchantments: {},
      stats: { power: 1, chargeSpeed: 1, knockback: 1, critChance: 0.05 },
    };
    Workers.initializeWorkers(this);
    this.state.balls.push(this._newBall('cue', CX, CY + 100));
    this._spawnResource('tree', 290, 485);
    this._spawnResource('tree', 710, 485);
    this._spawnResource('ore', 700, 210);
    this._refreshBookOffers(true);
    this.state.objective = this.getObjective();
    return this.state;
  }

  start() {
    this.reset();
    this.state.phase = 'playing';
    return this.state;
  }

  getWorkerInfo() { return Workers.getWorkerInfo(this); }
  getEnemyScaling() { return getEnemyScaling(this.state.stageWave); }
  canHireWorker(role) { return Workers.canHireWorker(this, role); }
  hireWorker(role) { return Workers.hireWorker(this, role); }
  canUpgradeWorker(role, id) { return Workers.canUpgradeWorker(this, role, id); }
  upgradeWorker(role, id) { return Workers.upgradeWorker(this, role, id); }

  getBeaconInfo() {
    const s = this.state;
    return {
      level: s.beacon.level, maxLevel: BEACON_TIERS.length, pyramidLayers: s.beacon.level - 1,
      hp: s.hp, maxHp: s.maxHp, shield: s.shield, maxShield: s.maxShield,
      shockCooldown: s.beacon.shockCooldown, materials: { ...s.materials },
      levelUpgrade: this.canUpgradeBeacon('level'),
      upgrades: BEACON_UPGRADES.map(upgrade => this.canUpgradeBeacon(upgrade.id)),
    };
  }

  canUpgradeBeacon(id) {
    const s = this.state;
    const beacon = s.beacon;
    const body = id === 'level';
    const definition = BEACON_UPGRADES.find(upgrade => upgrade.id === id);
    if (!body && !definition) return { id, ok: false, locked: true, reason: '信标升级不存在', cost: {} };
    const rank = body ? beacon.level : beacon.upgrades[id] || 0;
    const maxRank = body ? BEACON_TIERS.length : definition.maxRank;
    const nextTier = body ? BEACON_TIERS.find(tier => tier.level === rank + 1) : null;
    const requiredLevel = body ? rank : id === 'repair' ? Math.min(5, 1 + Math.floor(rank / 3)) : Math.min(5, definition.minLevel + rank);
    const scale = 1 + rank * (id === 'repair' ? 0.35 : 0.6);
    const cost = body ? { ...(nextTier?.cost || {}) } : Object.fromEntries(Object.entries(definition.cost).map(([key, value]) => [key, Math.ceil(value * scale)]));
    const check = {
      id, name: body ? '升级信标' : definition.name,
      description: body ? nextTier ? `升级至 ${nextTier.level} 级，生命上限增加 ${nextTier.maxHpBonus - BEACON_TIERS[rank - 1].maxHpBonus} 点，并恢复部分生命。` : '信标已经达到最高等级。' : definition.description,
      rank, level: rank, nextRank: Math.min(maxRank, rank + 1), maxRank, maxLevel: maxRank,
      requiredLevel, pyramidLayers: body ? Math.min(4, rank) : beacon.level - 1,
      cost, ok: false, locked: false, reason: '',
    };
    if (!['playing', 'paused'].includes(s.phase)) return { ...check, locked: true, reason: '当前不能升级信标' };
    if (rank >= maxRank) return { ...check, locked: true, reason: '已经达到最高等级' };
    if (beacon.level < requiredLevel) return { ...check, locked: true, reason: `需要 ${requiredLevel} 级信标` };
    if (Object.entries(cost).some(([key, amount]) => (s.materials[key] || 0) < amount)) return { ...check, reason: '材料不足' };
    return { ...check, ok: true };
  }

  upgradeBeacon(id) {
    const check = this.canUpgradeBeacon(id);
    if (!check.ok) return false;
    const s = this.state;
    for (const [key, amount] of Object.entries(check.cost)) s.materials[key] -= amount;
    const oldMaxHp = s.maxHp;
    if (id === 'level') s.beacon.level += 1;
    else s.beacon.upgrades[id] = (s.beacon.upgrades[id] || 0) + 1;
    this._syncBaseStats();
    if (id === 'level') s.hp = Math.min(s.maxHp, s.hp + Math.round((s.maxHp - oldMaxHp) * 0.6) + 10);
    if (id === 'repair') s.hp = Math.min(s.maxHp, s.hp + 38);
    if (id === 'regen' && s.beacon.upgrades.regen === 1) s.regenTimer = 10;
    this.onEvent({ type: 'beaconUpgrade', x: CX, y: CY, id, level: s.beacon.level, rank: id === 'level' ? s.beacon.level : s.beacon.upgrades[id] });
    return true;
  }

  _updateBeacon(dt) {
    const s = this.state;
    const beacon = s.beacon;
    beacon.shockCooldown = Math.max(0, beacon.shockCooldown - dt);
    const rank = beacon.upgrades.shock || 0;
    if (!rank || beacon.shockCooldown > 0) return;
    const radius = 160 + rank * 25;
    const targets = s.enemies.filter(enemy => enemy.hp > 0 && length(enemy.x - CX, enemy.y - CY) <= radius + enemy.r)
      .sort((a, b) => length(a.x - CX, a.y - CY) - length(b.x - CX, b.y - CY));
    if (!targets.length) return;
    beacon.shockCooldown = 8 - rank * 1.25;
    const damage = 8 + rank * 8;
    this.onEvent({ type: 'pulse', x: CX, y: CY, radius, value: damage, color: '#67e8f9', source: 'beacon_shock' });
    for (const enemy of targets) {
      this._damage(enemy, damage, '#67e8f9', null, 'player', { source: 'beacon_shock', angle: Math.atan2(enemy.y - CY, enemy.x - CX) });
      const angle = Math.atan2(enemy.y - CY, enemy.x - CX);
      const impulse = (180 + rank * 60) / (BOSS_KINDS.has(enemy.kind) ? 3 : 1);
      enemy.vx += Math.cos(angle) * impulse; enemy.vy += Math.sin(angle) * impulse;
      enemy.chainLeft = 0; delete enemy.sourceBallId;
      this._limit(enemy, 650); this._containEnemy(enemy);
    }
  }

  getObjective() {
    const s = this.state;
    if (s.stage === 'overworld') return s.portal ? '下界传送门已建好，进入下界。' : `收集黑曜石建造下界传送门：${Math.min(10, s.materials.obsidian || 0)}/10`;
    if (s.stage === 'nether') return s.portal ? '返程传送门已建好，返回主世界。' : `收集返程材料：末影珍珠 ${Math.min(12, s.materials.endPearl || 0)}/12，烈焰粉 ${Math.min(12, s.materials.blazePowder || 0)}/12`;
    if (s.stage === 'return') return s.portal ? '三波防守完成，进入末地。' : `抵挡三波反攻：${Math.min(3, Math.floor(s.stageElapsed / 30))}/3 波（还需 ${Math.max(0, Math.ceil(90 - s.stageElapsed))} 秒）`;
    const remaining = s.crystals.filter(c => c.hp > 0).length;
    return remaining ? `击破黑曜石护壳，摧毁末地水晶：还剩 ${remaining} 座` : s.bossesDefeated.includes('dragon') ? '末影龙已被击败！' : '所有水晶已摧毁，击败末影龙！';
  }

  canBuildPortal() {
    const s = this.state;
    if (!['playing', 'paused'].includes(s.phase)) return { ok: false, reason: '当前不能建造传送门' };
    if (s.portal) return { ok: false, reason: '传送门已经建好' };
    const cost = s.stage === 'overworld' ? { obsidian: 10 } : s.stage === 'nether' ? { endPearl: 12, blazePowder: 12 } : null;
    if (!cost) return { ok: false, reason: s.stage === 'return' ? '抵挡完整三波后传送门会自动升起' : '当前阶段无需建门' };
    if (Object.entries(cost).some(([key, amount]) => (s.materials[key] || 0) < amount)) return { ok: false, reason: '传送门材料不足', cost };
    return { ok: true, reason: '', cost, targetStage: s.stage === 'overworld' ? 'nether' : 'return' };
  }

  buildPortal() {
    const check = this.canBuildPortal();
    if (!check.ok) return false;
    for (const [key, amount] of Object.entries(check.cost)) this.state.materials[key] -= amount;
    this._createPortal(check.targetStage, 'portalBuild');
    return true;
  }

  _createPortal(targetStage, type) {
    const s = this.state;
    s.portal = { id: this._id++, kind: targetStage, targetStage, x: 790, y: 360, r: 34, riseTimer: type === 'portalRise' ? 2 : 1 };
    s.objective = this.getObjective();
    this.onEvent({ type, ...s.portal, stage: s.stage });
  }

  enterPortal() {
    const s = this.state;
    if (!['playing', 'paused'].includes(s.phase) || !s.portal || s.portal.riseTimer > 0) return false;
    this.cancelAim();
    s.transition = { from: s.stage, to: s.portal.targetStage, elapsed: 0, duration: 2.5 };
    s.phase = 'transition';
    this.onEvent({ type: 'transitionStart', x: s.portal.x, y: s.portal.y, ...s.transition });
    return true;
  }

  _changeStage(to) {
    const s = this.state;
    this.cancelAim();
    s.upgradeTarget = null; s.choices = []; this._offeredUpgrades = [];
    const from = s.stage;
    for (const ball of s.balls) this._clearRicochet(ball);
    this._ricochetChains.clear();
    s.stage = to; s.stageElapsed = 0; s.stageWave = 1;
    s.portal = null; s.transition = null; s.qte = null; s.bossIntro = null;
    s.enemies = []; s.projectiles = []; s.resources = []; s.experienceOrbs = []; s.structures = []; s.crystals = []; s.beams = [];
    this._buildCooldowns.clear();
    s.piglinAggro = false; s.baseBurnTimer = 0;
    if (to === 'nether') {
      for (const ally of s.allies) if (ally.kind === 'snow_golem') this._meltAlly(ally);
      s.allies = s.allies.filter(ally => ally.hp > 0);
    }
    s.balls = s.balls.filter(b => b.type !== 'ghost' && !b.detonated);
    for (const [index, ball] of s.balls.entries()) {
      delete ball.heldBy;
      ball.vx = 0; ball.vy = 0;
      Object.assign(ball, this._findBallPlacement(ball, CX + (index % 5 - 2) * 55, CY + 105 + Math.floor(index / 5) * 45));
    }
    for (const [index, ally] of s.allies.entries()) { ally.x = CX + (index % 2 ? 85 : -85); ally.y = CY + (index < 2 ? -65 : 65); ally.vx = 0; ally.vy = 0; }
    this._lastStageWave = 1; this._netherSpawnCount = 0; this._oreCount = 0;
    this._bookOfferWave = `${to}:1`;
    this._spawnTimer = 2; this._treeTimer = 8; this._oreTimer = 10; this._stormTimer = 7;
    this._contacts.clear(); this._elements.clear();
    s.weather = to === 'nether' ? 'nether' : to === 'end' ? 'end' : 'sunny';
    if (to === 'end') {
      for (const [x, y] of [[235, 170], [765, 170], [235, 550], [765, 550]]) s.crystals.push({ id: this._id++, x, y, r: 24, shield: 80, maxShield: 80, hp: 100, maxHp: 100 });
    } else {
      this._spawnResource('tree', 290, 485);
      this._spawnResource('tree', 710, 485);
      this._spawnResource('ore', 700, 210, to === 'nether' ? 'quartz' : 'iron');
      if (to === 'nether') this._spawnResource('ore', 280, 200, 'endPearl');
    }
    s.phase = 'playing';
    s.objective = this.getObjective();
    Workers.relocateWorkers(this);
    this._refreshBookOffers();
    this.onEvent({ type: 'stageChange', x: CX, y: CY, from, to, stage: to });
    this.onEvent({ type: 'weatherChange', x: CX, y: CY, weather: s.weather });
    this._onStageWave(1);
  }

  _onStageWave(wave) {
    const s = this.state;
    s.enemyScaling = getEnemyScaling(wave);
    this.onEvent({ type: 'waveStart', x: CX, y: CY, stage: s.stage, stageWave: wave, ...s.enemyScaling });
    if ((s.stage === 'overworld' || s.stage === 'return') && wave > 1 && wave % 2 === 1) {
      const choices = ['sunny', 'rain', 'storm', 'night'].filter(weather => weather !== s.weather);
      s.weather = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
      this._stormTimer = 7;
      this.onEvent({ type: 'weatherChange', x: CX, y: CY, weather: s.weather });
    }
    if (s.stage === 'overworld' && wave > 10 && !s.bossesSpawned.includes('warden') && (wave >= 15 || this.random() < 0.25)) this._spawnBoss('warden');
    if (s.stage === 'nether' && !s.bossesSpawned.includes('wither') && (wave >= 6 || this.random() < 0.25)) this._spawnBoss('wither');
  }

  _spawnBoss(kind) {
    if (this.state.bossesSpawned.includes(kind)) return null;
    const enemy = this._spawnEnemy(kind);
    if (!enemy) return null;
    this.state.bossesSpawned.push(kind);
    this.state.bossIntro = { kind, name: BOSS_NAMES[kind] || kind };
    this.onEvent({ type: 'bossIntro', x: enemy.x, y: enemy.y, ...this.state.bossIntro });
    return enemy;
  }

  _updateExpedition(dt) {
    const s = this.state;
    s.stageElapsed += dt;
    if (s.portal) s.portal.riseTimer = Math.max(0, s.portal.riseTimer - dt);
    s.stageWave = 1 + Math.floor((s.stageElapsed + 1e-8) / 30);
    while (this._lastStageWave < s.stageWave) { this._lastStageWave += 1; this._onStageWave(this._lastStageWave); }
    if (s.stage === 'return' && s.stageElapsed >= 90 - 1e-8 && !s.portal) this._createPortal('end', 'portalRise');
    if (s.stage === 'end') this._ensureDragon();
    if (s.weather === 'storm') {
      this._stormTimer -= dt;
      if (this._stormTimer <= 0) { this._stormTimer += 7; this._strikeLightning(100 + this.random() * 800, 100 + this.random() * 520); }
    }
    if (s.baseBurnTimer > 0) {
      s.baseBurnTimer = Math.max(0, s.baseBurnTimer - dt);
      this._baseBurnTick -= dt;
      if (this._baseBurnTick <= 0) { this._baseBurnTick += 1; this._hurtBase(1); }
    } else this._baseBurnTick = 1;
    s.objective = this.getObjective();
  }

  _strikeLightning(x, y) {
    const s = this.state;
    const rod = s.structures.filter(structure => structure.kind === 'lightning_rod').sort((a, b) => length(a.x - x, a.y - y) - length(b.x - x, b.y - y))[0];
    if (rod) { x = rod.x; y = rod.y; }
    this.onEvent({ type: 'weatherStrike', x, y, radius: 180, redirected: Boolean(rod), weather: s.weather });
    this.onEvent({ type: 'lightning', x, y, from: { x, y: y - 300 }, to: { x, y }, value: 50 * this._lightningMultiplier(), source: 'weather', redirected: Boolean(rod), color: '#a5e9ff' });
    if (rod) this._safeTntExplosion += 1;
    try { this._areaDamage(x, y, 180, 50 * this._lightningMultiplier(), '#a5e9ff', 'weather', 24); }
    finally { if (rod) this._safeTntExplosion -= 1; }
    if (!rod && length(x - CX, y - CY) < 95) this._hurtBase(5);
  }

  _fireMultiplier() { return ['rain', 'storm'].includes(this.state.weather) ? 0.6 : 1; }
  _lightningMultiplier() { return ['rain', 'storm'].includes(this.state.weather) ? 1.4 : 1; }

  _spawnProfile() {
    const s = this.state;
    let profile = getSpawnProfile(s.stageElapsed);
    if (s.stage === 'nether') profile = getSpawnProfile(Math.min(270, s.stageElapsed + 90));
    if (s.stage === 'return') profile = { interval: s.stageElapsed < 30 ? 1.4 : s.stageElapsed < 60 ? 1.3 : 1.25, count: s.stageElapsed < 30 ? 3 : s.stageElapsed < 60 ? 4 : 5, eliteChance: 0.24, slimeChance: 0.22 };
    if (s.stage === 'end') profile = { interval: 1.5, count: s.stageElapsed < 60 ? 3 : 4, eliteChance: 0, slimeChance: 0 };
    return { ...profile, interval: profile.interval / (s.weather === 'night' ? 1.5 : 1) };
  }

  _chooseStageEnemy(profile) {
    const s = this.state;
    if (s.stage === 'end') return { kind: 'enderman', extra: {} };
    if (s.stage === 'nether' && this.random() < 0.8) {
      const kinds = ['blaze', 'enderman', 'zombified_piglin', 'magma_cube', 'blaze', 'enderman', 'piglin_brute', 'ghast'];
      const kind = kinds[this._netherSpawnCount++ % kinds.length];
      return { kind, extra: kind === 'magma_cube' ? { size: this.random() < 0.7 ? 2 : 3 } : {} };
    }
    const time = s.stage === 'overworld' ? s.stageElapsed : 180;
    const elitePool = ['shield_zombie', 'skeleton'];
    if (time >= 75) elitePool.push('creeper', 'trident_drowned');
    if (time >= 90) elitePool.push('enderman');
    if (time >= 120) elitePool.push('evoker', 'vindicator', 'witch');
    const roll = this.random();
    if (roll < profile.eliteChance) return { kind: elitePool[Math.min(elitePool.length - 1, Math.floor(this.random() * elitePool.length))], extra: {} };
    if (roll < profile.eliteChance + profile.slimeChance) {
      const sizeRoll = this.random();
      return { kind: 'slime', extra: { size: sizeRoll < 0.65 ? 1 : sizeRoll < 0.93 ? 2 : 3 } };
    }
    const normalPool = time < 30 ? ['zombie'] : time < 60 ? ['zombie', 'zombie', 'drowned'] : ['zombie', 'zombie', 'drowned', 'husk'];
    return { kind: normalPool[Math.min(normalPool.length - 1, Math.floor(this.random() * normalPool.length))], extra: {} };
  }

  togglePause() {
    if (this.state.phase === 'playing') { this.cancelAim(); this.state.phase = 'paused'; }
    else if (this.state.phase === 'paused') this.state.phase = 'playing';
    else return false;
    return true;
  }

  equipRod(id) {
    const s = this.state;
    if (!['playing', 'paused'].includes(s.phase) || !s.ownedRods.includes(id)) return false;
    this.cancelAim();
    s.activeRod = id;
    this._syncStats();
    return true;
  }

  describeBall(ball) { return describeBall(ball); }

  describeRicochet(ball) { return describeRicochet(ball); }

  describeCatch(ball) { return describeCatch(ball); }

  _isTurret(ball) { return Boolean(ball && !['ghost', 'tnt'].includes(ball.type) && (ball.enchantments?.stationary_turret || 0) > 0); }
  _combatTraits(ball) { return effectiveTraitsOf(ball); }
  _combatSnapshot(ball) {
    if (!ball) return null;
    if (ball.combatLevels) return ball;
    return { ...ball, traits: [...traitsOf(ball)], combatTraits: effectiveTraitsOf(ball), enchantments: { ...blockEnchantmentsOf(ball) }, shotEnchantments: { ...ball.shotEnchantments }, fireTimer: Math.max(ball.fireTimer || 0, ball.ricochet?.fireTimer || 0), ricochet: null, combatLevels: Object.fromEntries(UPGRADES.map(upgrade => [upgrade.id, this._level(upgrade.id, ball)])) };
  }
  _buildReady(key, cooldown) {
    if (this.state.elapsed - (this._buildCooldowns.get(key) ?? -Infinity) < cooldown) return false;
    this._buildCooldowns.set(key, this.state.elapsed);
    return true;
  }

  getBuildInfo(ballId = null) {
    const s = this.state;
    const ball = s.balls.find(candidate => candidate.id === ballId) || s.balls.find(candidate => candidate.type === 'cue');
    if (!ball) return { ballId: null, ballName: '未选方块', rodId: s.activeRod, rodName: RODS.find(rod => rod.id === s.activeRod).name, mode: 'ball', effects: [], combos: [], summary: '' };
    const moving = length(ball.vx, ball.vy) > 20 && !ball.aimHeld && !this._isTurret(ball);
    const source = moving ? ball : { ...ball, shotRod: s.activeRod, shotEnchantments: s.rodEnchantments[s.activeRod] };
    const ids = [...Combat.BUILD_IDS, 'echo', 'storm', 'frost', 'iron', 'slime', 'steam_burst', 'storm_link', 'power', 'charge', 'crit', 'knockback', 'ricochet', 'elasticity', 'time_dilation', 'looting'];
    const effects = ids.map(id => {
      const spec = UPGRADES.find(upgrade => upgrade.id === id);
      const native = ['storm', 'frost', 'iron', 'slime'].includes(id);
      const level = id === 'stationary_turret' ? ball.enchantments?.[id] || 0 : native ? effectiveTraitsOf(ball).includes(id) ? Math.max(1, s.upgrades[id] || 0) : 0 : this._level(id, source);
      const sources = [];
      if (s.upgrades[id] && id !== 'stationary_turret') sources.push('本局强化');
      if (source.shotEnchantments?.[id]) sources.push('球杆');
      if (ball.enchantments?.[id] || traitsOf(ball).includes(id)) sources.push('方块');
      if (ball.ricochet?.enchantments?.[id] || ball.ricochet?.traits?.includes(id)) sources.push('临时继承');
      return { id, name: spec.name, level, active: level > 0, source: sources.join(' / '), description: spec.description };
    });
    const has = id => effects.some(effect => effect.id === id && effect.active);
    const mode = this._isTurret(ball) ? 'beam' : 'ball';
    const combos = [
      { id: 'fire_frost', name: '冰火共存', description: '持续灼烧与三段冰霜可以同时生效，碎冰不会熄火。', active: has('fire_aspect') && (has('frost_touch') || has('frost')) },
      { id: 'beam_echo', name: '光束齐射', description: '炮台的连击幻影变为多束光束，每束继承元素。', active: mode === 'beam' && has('echo') },
      { id: 'beam_storm', name: '雷光传导', description: '光束命中触发红石链雷，电流继续传递命中元素。', active: mode === 'beam' && has('storm') },
      { id: 'beam_slime', name: '弹性光路', description: '粘液炮台的光束射程更长，能够多次反弹。', active: mode === 'beam' && has('slime') },
      { id: 'prism_elements', name: '棱镜传承', description: '分叉方块和光束保留原方块的元素与附魔。', active: has('prism') && (has('fire_aspect') || has('frost_touch') || has('frost') || has('storm')) },
      { id: 'gravity_quake', name: '聚怪裂地', description: '引力聚拢的敌人更容易同时受到裂地震波和塌缩伤害。', active: has('gravity_mark') && has('earthshatter') },
    ];
    return { ballId: ball.id, ballName: describeBall(ball).name, rodId: source.shotRod || s.activeRod, rodName: RODS.find(rod => rod.id === (source.shotRod || s.activeRod)).name, mode, effects, combos, summary: effects.filter(effect => effect.active).map(effect => `${effect.name} ${effect.level}`).join(' · ') || '普通方块，可通过三选一或附魔构筑流派。' };
  }

  _ricochetEligible(ball) {
    return Boolean(ball && ['cue', ...TRAITS].includes(ball.type) && ball.life === undefined && !ball.heldBy && !ball.detonated);
  }

  _ensureRicochet(ball) {
    if (!ball.ricochet) ball.ricochet = { count: 0, participantIds: [ball.id], traits: [], enchantments: {}, fireTimer: 0, damageBonus: 0 };
    if (!this._ricochetChains.has(ball.ricochetChainId)) {
      ball.ricochetChainId = this._nextRicochetChain++;
      this._ricochetChains.set(ball.ricochetChainId, new Set([ball.id]));
    }
    return ball.ricochet;
  }

  _clearRicochet(ball) {
    if (!ball) return;
    const members = this._ricochetChains.get(ball.ricochetChainId);
    if (members) { members.delete(ball.id); if (!members.size) this._ricochetChains.delete(ball.ricochetChainId); }
    delete ball.ricochetChainId;
    ball.ricochet = null;
    ball.charge = 0;
    ball.beaconRicochetBonus = 0;
    ball.catchBonus = null;
    delete ball.catchPreviewEpoch; delete ball.catchPreviewPrecise; delete ball.catchAnnouncedEpoch;
  }

  _refreshRicochet(ball) {
    if (!ball?.ricochet) return;
    const record = ball.ricochet;
    record.count = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Number(record.count) || 0));
    const others = new Set(record.participantIds.filter(id => id !== ball.id)).size;
    record.damageBonus = Math.min(Number.MAX_SAFE_INTEGER, record.count * (0.08 + 0.06 * this._level('ricochet', ball)) + others * 0.15);
    ball.charge = Math.min(1, record.count * 0.08);
  }

  _recordRicochet(ball, incomingSpeed, contact) {
    if (!this._ricochetEligible(ball) || !Number.isFinite(incomingSpeed) || incomingSpeed < 80 || !this._contactReady(`ric:${ball.id}:${ball.ricochetEpoch || 0}:${contact}`, 0.08)) return false;
    const record = this._ensureRicochet(ball);
    record.count = Math.min(Number.MAX_SAFE_INTEGER, record.count + 1);
    this._refreshRicochet(ball);
    return true;
  }

  _mergeRicochetChains(a, b) {
    if (!this._ricochetEligible(a) || !this._ricochetEligible(b)) return;
    this._ensureRicochet(a); this._ensureRicochet(b);
    const chainIds = new Set([a.ricochetChainId, b.ricochetChainId]);
    const ids = new Set([a.id, b.id]);
    for (const chainId of chainIds) for (const id of this._ricochetChains.get(chainId) || []) ids.add(id);
    const members = this.state.balls.filter(ball => ids.has(ball.id) && this._ricochetEligible(ball) && chainIds.has(ball.ricochetChainId));
    const participants = new Set(); const traits = new Set(); const enchantments = {};
    let fireTimer = 0;
    for (const ball of members) {
      for (const id of ball.ricochet.participantIds) participants.add(id);
      participants.add(ball.id);
      for (const trait of effectiveTraitsOf(ball)) traits.add(trait);
      for (const [id, level] of Object.entries(blockEnchantmentsOf(ball))) if (id !== 'stationary_turret') enchantments[id] = Math.max(enchantments[id] || 0, level);
      fireTimer = Math.max(fireTimer, ball.fireTimer || 0, ball.ricochet.fireTimer || 0);
    }
    // Borrowed Fire Aspect must work without another shot; repeated contact does not refresh it.
    if (enchantments.fire_aspect && members.some(ball => (blockEnchantmentsOf(ball).fire_aspect || 0) < enchantments.fire_aspect)) fireTimer = Math.max(fireTimer, 3 + enchantments.fire_aspect * 0.7);
    const chainId = a.ricochetChainId;
    for (const id of chainIds) this._ricochetChains.delete(id);
    this._ricochetChains.set(chainId, new Set(members.map(ball => ball.id)));
    for (const ball of members) {
      ball.ricochetChainId = chainId;
      ball.ricochet.participantIds = [...participants];
      ball.ricochet.traits = TRAITS.filter(trait => traits.has(trait));
      ball.ricochet.enchantments = { ...enchantments };
      ball.ricochet.fireTimer = fireTimer;
      this._refreshRicochet(ball);
    }
  }

  _ballMass(ball) {
    return effectiveTraitsOf(ball).includes('iron') ? Math.min(6, Math.max(ball.mass, 2.6 + (this.state.upgrades.iron || 1) * 0.65)) : ball.mass;
  }

  _restitution(ball, baseline, cap = 1) {
    const slime = effectiveTraitsOf(ball).includes('slime');
    const retained = Math.max(baseline, slime ? 0.96 + Math.min(2, Math.max(0, (this.state.upgrades.slime || 1) - 1)) * 0.01 : 0);
    return Math.min(slime ? Math.min(cap, 0.995) : cap, retained + this._level('elasticity', ball) * 0.05);
  }

  _isBurning(ball) { return (ball.fireTimer || 0) > 0 || (ball.ricochet?.fireTimer || 0) > 0; }

  canFuse(aId, bId) {
    const s = this.state;
    if (!['playing', 'paused'].includes(s.phase)) return { ok: false, reason: '当前不能融合' };
    if (!s.stations.anvil) return { ok: false, reason: '先合成铁砧才能融合' };
    if (aId === bId) return { ok: false, reason: '请选择两个不同方块' };
    const a = s.balls.find(b => b.id === aId);
    const b = s.balls.find(b => b.id === bId);
    if (!a || !b) return { ok: false, reason: '方块不存在' };
    if (a.type === 'tnt' || b.type === 'tnt') return { ok: false, reason: 'TNT是爆破道具方块，不能融合' };
    if ([a, b].some(ball => ball.type === 'ghost' || ball.life !== undefined)) return { ok: false, reason: '幽灵方块不能融合' };
    if (a.heldBy || b.heldBy) return { ok: false, reason: '先救出被抓住的方块' };
    const level = Math.max(a.fusionLevel || 0, b.fusionLevel || 0) + 1;
    if (level > 3) return { ok: false, reason: '融合等级最高为三级' };
    const keeper = b.type === 'cue' ? b : a;
    const traits = TRAITS.filter(trait => traitsOf(a).includes(trait) || traitsOf(b).includes(trait));
    const enchantments = { ...(a.enchantments || {}) };
    for (const [id, value] of Object.entries(b.enchantments || {})) enchantments[id] = Math.max(value, enchantments[id] || 0);
    if (Object.keys(enchantments).length > 4) return { ok: false, reason: '合并后超过四种附魔，请先重洗其中一块' };
    const preview = describeBall({ ...keeper, traits, fusionLevel: level });
    return { ok: true, reason: '', ...preview, enchantments };
  }

  fuseBlocks(aId, bId) {
    const preview = this.canFuse(aId, bId);
    if (!preview.ok) return false;
    this.cancelAim();
    const s = this.state;
    const a = s.balls.find(ball => ball.id === aId);
    const b = s.balls.find(ball => ball.id === bId);
    const keeper = b.type === 'cue' ? b : a;
    const donor = keeper === a ? b : a;
    this._clearRicochet(a); this._clearRicochet(b);
    keeper.traits = [...preview.traits];
    keeper.fusionLevel = preview.level;
    keeper.enchantments = { ...preview.enchantments };
    keeper.fireTimer = Math.max(a.fireTimer || 0, b.fireTimer || 0);
    keeper.charge = Math.max(a.charge || 0, b.charge || 0);
    keeper.vx = 0;
    keeper.vy = 0;
    s.balls = s.balls.filter(ball => ball.id !== donor.id);
    this._refreshBall(keeper);
    Object.assign(keeper, this._findBallPlacement(keeper, keeper.x, keeper.y));
    for (const key of this._elements.keys()) if (String(key).startsWith(`${donor.id}:`)) this._elements.delete(key);
    this.onEvent({ type: 'fusion', x: keeper.x, y: keeper.y, ballId: keeper.id, consumedId: donor.id, name: preview.name, traits: [...keeper.traits], value: keeper.fusionLevel });
    return true;
  }

  _refreshBall(ball) {
    ball.turretActive = this._isTurret(ball);
    if (ball.type === 'tnt') { ball.r = 15; ball.mass = 1.2; ball.traits = []; ball.fusionLevel = 0; return; }
    const traits = traitsOf(ball);
    const level = Math.min(3, ball.fusionLevel || 0);
    ball.traits = traits;
    const iron = traits.includes('iron');
    const frost = traits.includes('frost');
    const gold = traits.includes('gold');
    const slime = traits.includes('slime');
    ball.r = Math.min(22, (iron ? 16 : gold ? 14 : frost || slime ? 13 : ball.type === 'ghost' ? 8 : 12) + level * 1.5);
    ball.mass = Math.min(6, (iron ? 2.6 + (this.state.upgrades.iron || 1) * 0.65 : gold ? 2 : frost ? 1.25 : ball.type === 'ghost' ? 0.55 : 1) + level * 0.25);
  }

  _findBallPlacement(ball, x, y) {
    const radius = ball.r;
    const minX = WORLD.margin + radius;
    const maxX = WORLD.width - WORLD.margin - radius;
    const minY = WORLD.margin + radius;
    const maxY = WORLD.height - WORLD.margin - radius;
    const valid = (px, py) => length(px - CX, py - CY) >= WORLD.baseRadius + radius + 2
      && !this.state.balls.some(b => b.id !== ball.id && length(px - b.x, py - b.y) < radius + b.r + 2)
      && !this.state.resources.some(r => r.hp > 0 && r.fallTimer <= 0 && length(px - r.x, py - r.y) < radius + r.r + 2);
    for (let ring = 0; ring < 15; ring += 1) {
      for (let i = 0; i < (ring === 0 ? 1 : 16); i += 1) {
        const angle = i * Math.PI / 8;
        const px = clamp(x + Math.cos(angle) * ring * 28, minX, maxX);
        const py = clamp(y + Math.sin(angle) * ring * 28, minY, maxY);
        if (valid(px, py)) return { x: px, y: py };
      }
    }
    return { x: minX, y: minY };
  }

  _spawnTraitBall(type) {
    const s = this.state;
    if (s.balls.length >= MAX_BALLS) {
      const ghost = s.balls.findIndex(b => b.type === 'ghost');
      if (ghost < 0) return null;
      s.balls.splice(ghost, 1);
    }
    const cue = s.balls.find(b => b.type === 'cue') || { x: CX, y: CY + 100 };
    const ball = this._newBall(type, cue.x + 45, cue.y + 35);
    this._refreshBall(ball);
    Object.assign(ball, this._findBallPlacement(ball, ball.x, ball.y));
    const angle = this.random() * Math.PI * 2;
    ball.vx = Math.cos(angle) * 300;
    ball.vy = Math.sin(angle) * 300;
    s.balls.push(ball);
    return ball;
  }

  _aimTimeScale() {
    const s = this.state;
    const rank = clamp(s.rodEnchantments[s.activeRod]?.time_dilation || 0, 0, 4);
    return Math.max(0.06, (s.activeRod === 'end' ? 0.15 : 0.30) * Math.pow(0.8, rank));
  }

  getAimInfo() {
    const aim = this.state.aim;
    if (!aim) return { active: false, ballId: null, timeScale: this._aimTimeScale(), caughtSpeed: 0, damageBonus: 0, speedBonus: 0, streak: 0, grade: 'steady', precise: false, mode: 'ball', chargeProgress: 0, chargeRequired: 0, ready: true };
    return { active: true, ballId: aim.ballId, timeScale: aim.timeScale, caughtSpeed: aim.caughtSpeed, damageBonus: aim.damageBonus, speedBonus: aim.speedBonus, streak: aim.streak, grade: aim.grade, precise: aim.precise, mode: aim.mode, chargeRequired: aim.chargeRequired, chargeProgress: aim.mode === 'beam' ? Math.min(1, aim.chargeTime / aim.chargeRequired) : 1, ready: aim.mode !== 'beam' || aim.chargeTime + 1e-9 >= aim.chargeRequired };
  }

  beginAim(ballId = null) {
    const s = this.state;
    if (s.phase !== 'playing') return false;
    const ball = ballId === null ? s.balls.find(candidate => candidate.type === 'cue') : s.balls.find(candidate => candidate.id === ballId);
    if (!ball || ball.type === 'ghost' || ball.life !== undefined || ball.heldBy || ball.detonated) return false;
    if (s.aim?.ballId === ball.id) return true;
    this.cancelAim();
    const caughtSpeed = Math.min(MAX_SPEED, length(ball.vx, ball.vy));
    const eligible = caughtSpeed >= 180 && s.elapsed - (ball.lastShotAt ?? -Infinity) >= 0.12;
    const streak = eligible ? Math.min(99, (ball.catchBonus?.streak || 0) + 1) : 0;
    const momentum = clamp((caughtSpeed - 180) / 820, 0, 1);
    const damageBonus = eligible ? Math.min(0.6, 0.08 + momentum * 0.4 + Math.min(4, streak - 1) * 0.03) : 0;
    const speedBonus = eligible ? Math.min(0.12, 0.02 + momentum * 0.10) : 0;
    const grade = !eligible ? 'steady' : caughtSpeed < 450 ? 'moving' : caughtSpeed < 800 ? 'swift' : 'perfect';
    const epoch = ball.ricochetEpoch || 0;
    if (eligible && ball.catchPreviewEpoch !== epoch) { ball.catchPreviewEpoch = epoch; ball.catchPreviewPrecise = this.random() < 0.16; }
    const precise = eligible && Boolean(ball.catchPreviewPrecise);
    const mode = this._isTurret(ball) ? 'beam' : 'ball';
    const source = { ...ball, shotEnchantments: s.rodEnchantments[s.activeRod] };
    const chargeRequired = mode === 'beam' ? Math.max(0.25, 0.85 / (1 + this._level('charge', source) * 0.3) / (1 + ((ball.enchantments.stationary_turret || 1) - 1) * 0.12)) : 0;
    s.aim = { ballId: ball.id, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, caughtSpeed, damageBonus, speedBonus, streak, grade, precise, timeScale: this._aimTimeScale(), mode, chargeRequired, chargeTime: 0 };
    ball.aimHeld = true; ball.vx = 0; ball.vy = 0;
    if (eligible && ball.catchAnnouncedEpoch !== epoch) {
      ball.catchAnnouncedEpoch = epoch;
      this.onEvent({ type: 'catch', x: ball.x, y: ball.y, ...this.getAimInfo(), pending: true });
    }
    return true;
  }

  cancelAim() {
    const s = this.state;
    const aim = s.aim;
    if (!aim) return false;
    const ball = s.balls.find(candidate => candidate.id === aim.ballId);
    if (ball) {
      delete ball.aimHeld;
      if (!ball.heldBy && !ball.detonated) { ball.x = aim.x; ball.y = aim.y; ball.vx = aim.vx; ball.vy = aim.vy; }
    }
    s.aim = null;
    return true;
  }

  shoot(angle, power01 = 1, ballId = null) {
    const s = this.state;
    if (s.phase !== 'playing' || this._shotCooldown > 0 || !Number.isFinite(angle) || !Number.isFinite(power01)) return false;
    const ball = ballId === null ? s.balls.find(b => b.type === 'cue') : s.balls.find(b => b.id === ballId);
    if (!ball || ball.type === 'ghost' || ball.life !== undefined || ball.heldBy || ball.detonated || (s.aim && s.aim.ballId !== ball.id)) return false;
    const turret = this._isTurret(ball);
    if (turret && (!s.aim || !this.getAimInfo().ready)) return false;
    const caught = s.aim ? { ...this.getAimInfo() } : null;
    this.cancelAim();
    this._clearRicochet(ball);
    ball.ricochetEpoch = (ball.ricochetEpoch || 0) + 1;
    ball.shotRod = s.activeRod;
    ball.shotEnchantments = { ...(s.rodEnchantments[s.activeRod] || {}) };
    ball.catchBonus = caught?.damageBonus > 0 ? { caughtSpeed: caught.caughtSpeed, damageBonus: caught.damageBonus, speedBonus: caught.speedBonus, streak: caught.streak, grade: caught.grade, precise: caught.precise } : null;
    ball.lastShotAt = s.elapsed;
    const slimeSpeed = effectiveTraitsOf(ball).includes('slime') ? 1.08 + Math.min(2, Math.max(0, (s.upgrades.slime || 1) - 1)) * 0.02 : 1;
    const force = Math.min(MAX_SPEED, (290 + clamp(power01, 0, 1) * 850) * (1 + describeCatch(ball).speedBonus) * slimeSpeed);
    // A deliberate shot replaces old momentum so the drag direction is authoritative.
    ball.vx = turret ? 0 : Math.cos(angle) * force;
    ball.vy = turret ? 0 : Math.sin(angle) * force;
    ball.turretActive = turret;
    this._limit(ball, MAX_SPEED);
    this._shotCooldown = 0.28 / (1 + this._level('charge', ball) * 0.3) * (s.activeRod === 'wood' ? 0.85 : 1) * (s.overchargeTimer > 0 ? 0.6 : 1);
    if (this._level('fire_aspect', ball)) ball.fireTimer = Math.max(ball.fireTimer || 0, 3 + this._level('fire_aspect', ball) * 0.7);
    s.shots += 1;
    this._event('shot', ball.x, ball.y, force, COLORS[ball.type]);
    if (ball.catchBonus) this.onEvent({ type: 'catchShot', x: ball.x, y: ball.y, ballId: ball.id, ...describeCatch(ball), pending: false });
    if (turret) { this._fireBeams(ball, angle); return true; }
    const echoes = this._level('echo', ball);
    const forks = Math.min(6, this._level('prism', ball) * 2);
    for (let i = 0; i < echoes + forks && s.balls.length < MAX_BALLS; i += 1) {
      const a = i < echoes ? angle + (i - (echoes - 1) / 2) * 0.22 : angle + ((i - echoes) % 2 ? 1 : -1) * (0.24 + Math.floor((i - echoes) / 2) * 0.15);
      const ghost = this._newBall('ghost', ball.x + Math.cos(a) * 24, ball.y + Math.sin(a) * 24);
      ghost.vx = Math.cos(a) * force * 0.9;
      ghost.vy = Math.sin(a) * force * 0.9;
      ghost.life = 2.4 + echoes * 0.35;
      ghost.shotRod = ball.shotRod;
      ghost.shotEnchantments = { ...ball.shotEnchantments };
      ghost.traits = effectiveTraitsOf(ball);
      ghost.enchantments = { ...blockEnchantmentsOf(ball) }; delete ghost.enchantments.stationary_turret;
      ghost.fireTimer = Math.max(ball.fireTimer || 0, ball.ricochet?.fireTimer || 0);
      ghost.branchDamageScale = i < echoes ? 1 : 0.7;
      s.balls.push(ghost);
    }
    return true;
  }

  _beamScene(ball) {
    const s = this.state;
    const reflectors = [{ id: 'base', kind: 'base', x: CX, y: CY, r: WORLD.baseRadius }, ...s.balls.filter(other => other.id !== ball.id && !other.heldBy && !other.aimHeld && !other.detonated && other.type !== 'ghost').map(other => ({ id: `ball:${other.id}`, kind: 'ball', x: other.x, y: other.y, r: other.r }))];
    const objects = [...s.enemies.filter(enemy => enemy.hp > 0).map(enemy => ({ id: `enemy:${enemy.id}`, target: enemy, kind: 'enemy' })), ...s.resources.filter(resource => resource.hp > 0 && !(resource.fallTimer > 0)).map(resource => ({ id: `resource:${resource.id}`, target: resource, kind: 'resource' })), ...s.crystals.filter(crystal => crystal.hp > 0).map(crystal => ({ id: `crystal:${crystal.id}`, target: crystal, kind: 'crystal' })), ...s.experienceOrbs.map(orb => ({ id: `xp:${orb.id}`, target: orb, kind: 'xp' }))];
    for (const object of objects) if (object.kind === 'resource' || object.kind === 'crystal') reflectors.push({ id: object.id, kind: object.kind, x: object.target.x, y: object.target.y, r: object.target.r });
    return { reflectors, objects, targets: objects.map(object => ({ id: object.id, x: object.target.x, y: object.target.y, r: object.target.r })) };
  }

  _beamPlans(ball, angle) {
    const plans = buildBeamPlan({ angle, echoLevel: this._level('echo', ball), prismLevel: this._level('prism', ball), turretLevel: ball.enchantments.stationary_turret });
    if (!effectiveTraitsOf(ball).includes('slime')) return plans;
    const level = clamp(this.state.upgrades.slime || 1, 1, 3);
    return plans.map(plan => ({ ...plan, range: plan.range * (1.2 + (level - 1) * 0.05), maxBounces: plan.maxBounces + level + 1 }));
  }

  previewBeam(angle, ballId = null) {
    const ball = ballId === null ? this.state.balls.find(candidate => candidate.type === 'cue') : this.state.balls.find(candidate => candidate.id === ballId);
    if (!ball || !this._isTurret(ball) || !Number.isFinite(angle)) return { segments: [] };
    const plan = this._beamPlans(ball, angle)[0];
    const scene = this._beamScene(ball);
    return traceBeam({ origin: { x: ball.x, y: ball.y, id: `ball:${ball.id}` }, ...plan, bounds: { minX: WORLD.margin, maxX: WORLD.width - WORLD.margin, minY: WORLD.margin, maxY: WORLD.height - WORLD.margin }, reflectors: scene.reflectors, targets: scene.targets });
  }

  _fireBeams(ball, angle) {
    const s = this.state;
    const plans = this._beamPlans(ball, angle);
    const hitCounts = new Map();
    const baseDamage = (30 + (ball.enchantments.stationary_turret || 1) * 10) * this._impactMultiplier(ball);
    for (const plan of plans) {
      const scene = this._beamScene(ball);
      const traced = traceBeam({ origin: { x: ball.x, y: ball.y, id: `ball:${ball.id}` }, ...plan, bounds: { minX: WORLD.margin, maxX: WORLD.width - WORLD.margin, minY: WORLD.margin, maxY: WORLD.height - WORLD.margin }, reflectors: scene.reflectors, targets: scene.targets });
      const beam = { id: this._id++, ballId: ball.id, segments: traced.segments, life: 0.35, maxLife: 0.35, width: plan.width, color: this._isBurning(ball) ? '#ffbd69' : effectiveTraitsOf(ball).includes('frost') ? '#a5e7ff' : '#c4b5fd', damage: baseDamage * plan.damageScale };
      s.beams.push(beam); this.onEvent({ type: 'beam', ...beam });
      const context = Combat.createHitContext();
      for (const hit of traced.hits) {
        const object = scene.objects.find(candidate => candidate.id === hit.targetId);
        if (!object || object.target.hp <= 0 || (hitCounts.get(hit.targetId) || 0) >= 3) continue;
        hitCounts.set(hit.targetId, (hitCounts.get(hit.targetId) || 0) + 1);
        const target = object.target;
        if (object.kind === 'xp') {
          if (s.experienceOrbs.includes(target)) { this._gainExperience(target); s.experienceOrbs = s.experienceOrbs.filter(orb => orb !== target); }
          continue;
        }
        if (object.kind === 'enemy' && target.kind === 'enderman' && !(target.teleportCooldown > 0) && target.id !== s.qte?.enemyId) {
          const from = { x: target.x, y: target.y };
          target.x -= Math.sin(plan.angle) * 105; target.y += Math.cos(plan.angle) * 105;
          target.teleportCooldown = 5; this._containEnemy(target);
          this.onEvent({ type: 'teleport', x: target.x, y: target.y, from, to: { x: target.x, y: target.y }, color: '#c084fc' });
          continue;
        }
        const damage = baseDamage * plan.damageScale * (1 + hit.bounce * (0.08 + this._level('ricochet', ball) * 0.06));
        if (object.kind === 'enemy') {
          s.combo += 1; s.comboTimer = 1.7; s.maxCombo = Math.max(s.maxCombo, s.combo);
          this._damage(target, damage, beam.color, ball, 'player', { source: 'beam', angle: plan.angle, buildContext: context });
        } else if (object.kind === 'resource') this._damageResource(target, this._miningDamage(ball, target, 950) * plan.damageScale, { source: 'beam', sourceBall: ball, angle: plan.angle, impactSpeed: 950 });
        else this._damageCrystal(target, damage, ball, { angle: plan.angle, impactSpeed: 950 });
      }
    }
    s.beams = s.beams.slice(-24);
  }

  recall() {
    const s = this.state;
    if (s.phase !== 'playing' || s.recallCooldown > 0) return false;
    const cue = s.balls.find(b => b.type === 'cue');
    if (!cue || cue.heldBy) return false;
    this.cancelAim();
    const storedCharge = cue.charge;
    this._clearRicochet(cue);
    cue.x = CX;
    cue.y = CY + 100;
    cue.vx = 0;
    cue.vy = 0;
    s.recallCooldown = 7;
    this._event('recall', cue.x, cue.y, 7, COLORS.cue);
    if (this._level('recall_burst')) {
      const damage = 12 + this._level('recall_burst') * 10 + Math.min(20, s.combo) * 2 + Math.round(storedCharge * 20);
      cue.charge = 0;
      this._areaDamage(CX, CY, 140 + this._level('recall_burst') * 25, damage, '#b9a0ff', 'recall', 16);
    }
    return true;
  }

  chooseUpgrade(id) {
    const s = this.state;
    if (s.phase !== 'upgrade' || s.upgradeTarget || s.pendingUpgrades <= 0 || !s.choices.includes(id) || !this._offeredUpgrades.includes(id)) return false;
    if (s.hp <= 0) { this._end('lost'); return false; }
    if (this._isVictory()) { this._end('won'); return false; }
    if (!this._isFreeUpgradeAvailable(id)) return false;
    if (id === 'stationary_turret') { s.upgradeTarget = id; return true; }
    this._applyUpgrade(id);
    this._completeUpgrade();
    return true;
  }

  _turretTargetCheck(ballId) {
    const ball = this.state.balls.find(candidate => candidate.id === ballId);
    const level = ball?.enchantments?.stationary_turret || 0;
    const info = { id: ballId, ballId, name: describeBall(ball).name, level, nextLevel: Math.min(3, level + 1), traits: traitsOf(ball), ok: false, reason: '' };
    if (!ball) return { ...info, reason: '方块不存在' };
    if (ball.type === 'ghost') return { ...info, reason: '幽灵方块不能改为炮台' };
    if (ball.type === 'tnt') return { ...info, reason: 'TNT只能由红石碰撞引爆，不能改为炮台' };
    if (ball.detonated || ball.life !== undefined || (ball.hp !== undefined && ball.hp <= 0)) return { ...info, reason: '这个方块已失效' };
    if (ball.heldBy) return { ...info, reason: '先救出被末影人抓住的方块' };
    if (level >= 3) return { ...info, reason: '此方块的炮台已满级' };
    if (!level && Object.keys(ball.enchantments || {}).length >= 4) return { ...info, reason: '此方块的四个附魔槽已满' };
    return { ...info, ok: true };
  }

  getUpgradeTargets() {
    return this.state.balls.filter(ball => ball.type !== 'ghost').map(ball => this._turretTargetCheck(ball.id));
  }

  canChooseUpgradeTarget(ballId) {
    const s = this.state;
    const check = this._turretTargetCheck(ballId);
    if (s.phase !== 'upgrade' || s.upgradeTarget !== 'stationary_turret' || s.pendingUpgrades <= 0 || !s.choices.includes('stationary_turret') || !this._offeredUpgrades.includes('stationary_turret')) return { ...check, ok: false, reason: '当前没有待确认的炮台奖励' };
    if (s.hp <= 0 || this._isVictory()) return { ...check, ok: false, reason: '本局已经结束' };
    return check;
  }

  chooseUpgradeTarget(ballId) {
    const s = this.state;
    if (s.phase === 'upgrade' && s.hp <= 0) { this._end('lost'); return false; }
    if (s.phase === 'upgrade' && this._isVictory()) { this._end('won'); return false; }
    if (!this.canChooseUpgradeTarget(ballId).ok) return false;
    if (!this._applyUpgrade('stationary_turret', ballId)) return false;
    this._completeUpgrade();
    return true;
  }

  cancelUpgradeTarget() {
    if (this.state.phase !== 'upgrade' || !this.state.upgradeTarget) return false;
    this.state.upgradeTarget = null;
    return true;
  }

  _completeUpgrade() {
    const s = this.state;
    s.pendingUpgrades -= 1;
    s.upgradeTarget = null;
    s.choices = [];
    this._offeredUpgrades = [];
    s.phase = 'playing';
    this._checkLevel();
  }

  _applyUpgrade(id, ballId = null) {
    const s = this.state;
    if (id === 'stationary_turret') {
      if (!this._turretTargetCheck(ballId).ok) return false;
      const ball = s.balls.find(candidate => candidate.id === ballId);
      ball.enchantments ||= {};
      ball.enchantments.stationary_turret = (ball.enchantments.stationary_turret || 0) + 1;
      ball.turretActive = true; ball.vx = ball.vy = 0; this._clearRicochet(ball);
      return true;
    }
    if (id.startsWith('supply_')) {
      if (id === 'supply_building') this._grantMaterials({ wood: 5, stone: 5 }, CX, CY);
      else if (id === 'supply_iron') this._grantMaterials({ iron: 3 }, CX, CY);
      else if (id === 'supply_book') {
        const enchantId = BOOK_IDS[Math.min(BOOK_IDS.length - 1, Math.floor(this.random() * BOOK_IDS.length))];
        s.books[enchantId] = (s.books[enchantId] || 0) + 1;
        this.onEvent({ type: 'dropBook', x: CX, y: CY, enchantId, name: UPGRADES.find(upgrade => upgrade.id === enchantId).name });
      }
      return;
    }
    const level = (s.upgrades[id] || 0) + 1;
    s.upgrades[id] = level;
    if (id === 'rod') {
      const rod = RODS[Math.min(3, level)];
      if (!s.ownedRods.includes(rod.id)) s.ownedRods.push(rod.id);
      s.activeRod = rod.id;
    }
    if (id === 'power') s.stats.power = 1 + level * 0.24;
    if (id === 'charge') s.stats.chargeSpeed = 1 + level * 0.3;
    if (id === 'knockback') s.stats.knockback = 1 + level * 0.3;
    if (id === 'crit') s.stats.critChance = 0.05 + level * 0.1;
    if (id === 'shield') {
      s.maxShield += 30;
      s.shield = Math.min(s.maxShield, s.shield + 30);
    }
    if (id === 'regen' && level === 1) s.regenTimer = 10;
    if (id === 'repair') {
      s.maxHp += 12;
      s.hp = Math.min(s.maxHp, s.hp + 38);
    }
    if (['iron', 'storm', 'frost', 'slime'].includes(id)) {
      if (!s.balls.some(b => b.type === id && !(b.fusionLevel > 0))) this._spawnTraitBall(id);
      for (const ball of s.balls) if (traitsOf(ball).includes(id)) this._refreshBall(ball);
    }
    this._syncStats();
    for (const ball of s.balls) this._refreshRicochet(ball);
  }

  canCraft(id) {
    const s = this.state;
    if (!['playing', 'paused'].includes(s.phase)) return { ok: false, reason: '当前不能合成' };
    if (id === 'repair') return { ok: false, reason: '请点击基地信标进行修缮' };
    const recipe = RECIPES.find(item => item.id === id);
    if (!recipe) return { ok: false, reason: '配方不存在' };
    if (recipe.ally === 'snow_golem' || id === 'snow_golem') {
      if (s.stage === 'nether') return { ok: false, reason: '下界高温会融化雪傀儡，无法在此合成' };
    }
    if (recipe.kind === 'pickaxe' && s.pickaxe !== recipe.requiresPickaxe) return { ok: false, reason: '需要上一等级的镐，且不能重复合成' };
    if (recipe.kind === 'station' && s.stations[recipe.station]) return { ok: false, reason: '已经建造了这个工作台' };
    if (recipe.kind === 'rod' && (!s.ownedRods.includes(recipe.requiresRod) || s.ownedRods.includes(recipe.rodId))) return { ok: false, reason: '需要已解锁上一阶球杆，且不能重复合成' };
    if (recipe.kind === 'ball' && s.balls.length >= MAX_BALLS && !s.balls.some(b => b.type === 'ghost')) return { ok: false, reason: '场上方块已达上限，先融合腾出位置' };
    if (recipe.kind === 'ally' && s.allies.filter(a => a.kind === id && a.hp > 0).length >= 2) return { ok: false, reason: '这种傀儡最多两只' };
    if (Object.entries(recipe.cost).some(([key, amount]) => (s.materials[key] || 0) < amount)) return { ok: false, reason: '材料不足' };
    return { ok: true, reason: '' };
  }

  craft(id) {
    const s = this.state;
    if (!this.canCraft(id).ok) return false;
    const recipe = RECIPES.find(item => item.id === id);
    for (const [key, amount] of Object.entries(recipe.cost)) s.materials[key] -= amount;
    if (recipe.kind === 'rod') {
      s.ownedRods.push(recipe.rodId);
      s.activeRod = recipe.rodId;
      s.upgrades.rod = Math.max(s.upgrades.rod || 0, recipe.rodLevel + 1);
    }
    else if (recipe.kind === 'ball') {
      if (TRAITS.includes(recipe.ballType)) s.upgrades[recipe.ballType] = Math.max(1, s.upgrades[recipe.ballType] || 0);
      this._spawnTraitBall(recipe.ballType);
    }
    else if (recipe.kind === 'item') s.items[id] = (s.items[id] || 0) + 1;
    else if (recipe.kind === 'ally') this._spawnAlly(id);
    else if (recipe.kind === 'station') s.stations[recipe.station] = true;
    else if (recipe.kind === 'pickaxe') s.pickaxe = recipe.pickaxeId;
    this._syncStats();
    s.objective = this.getObjective();
    this.onEvent({ type: 'craft', x: CX, y: CY, id, name: recipe.name });
    return true;
  }

  _level(id, ball = null) {
    if (ball?.combatLevels) return ball.combatLevels[id] || 0;
    const s = this.state;
    const rodBag = ball ? (ball.shotEnchantments || {}) : s.rodEnchantments[s.activeRod];
    return (s.upgrades[id] || 0) + (rodBag?.[id] || 0) + (blockEnchantmentsOf(ball)[id] || 0) + (s.baseEnchantments[id] || 0) + (s.beacon.upgrades[id] || 0);
  }

  _syncStats() {
    this.state.stats = { power: 1 + this._level('power') * 0.24, chargeSpeed: 1 + this._level('charge') * 0.3, knockback: 1 + this._level('knockback') * 0.3, critChance: Math.min(0.95, 0.05 + this._level('crit') * 0.1) };
  }

  _syncBaseStats() {
    const s = this.state;
    const oldShield = s.maxShield;
    s.maxHp = 120 + BEACON_TIERS[s.beacon.level - 1].maxHpBonus + 12 * ((s.upgrades.repair || 0) + (s.baseEnchantments.repair || 0) + (s.beacon.upgrades.repair || 0));
    s.hp = Math.min(s.hp, s.maxHp);
    s.maxShield = 30 * ((s.upgrades.shield || 0) + (s.baseEnchantments.shield || 0) + (s.beacon.upgrades.shield || 0));
    s.shield = Math.min(s.maxShield, s.shield + Math.max(0, s.maxShield - oldShield));
  }

  _targetRecord(target) {
    if (!target || !ENCHANT_POOLS[target.kind]) return null;
    const s = this.state;
    if (target.kind === 'rod' && s.ownedRods.includes(target.id)) return { bag: s.rodEnchantments[target.id], name: RODS.find(r => r.id === target.id).name };
    if (target.kind === 'base' && target.id === 'core') return { bag: s.baseEnchantments, name: '基地' };
    if (target.kind === 'ball') {
      const ball = s.balls.find(b => b.id === target.id && b.type !== 'ghost' && b.life === undefined && !b.heldBy);
      if (ball) return { bag: ball.enchantments || {}, name: describeBall(ball).name, ball };
    }
    return null;
  }

  _enchantPool(target) {
    const pool = ENCHANT_POOLS[target?.kind] || [];
    const ball = target?.kind === 'ball' ? this.state.balls.find(candidate => candidate.id === target.id) : null;
    return ball?.type === 'tnt' ? pool.filter(id => id !== 'stationary_turret') : [...pool];
  }

  describeEnchantTarget(target) {
    if (target?.kind === 'base') return { ok: false, reason: '基地能力已迁至信标，请点击基地信标升级', name: '信标', enchantments: {}, pool: [] };
    const record = this._targetRecord(target);
    if (!record) return { ok: false, reason: '目标不存在、未拥有或正被抓住', name: '', enchantments: {} };
    return { ok: true, reason: '', name: record.name, enchantments: { ...record.bag }, pool: this._enchantPool(target), maxSlots: 4 };
  }

  canEnchant(target, mode, bookId = null) {
    const s = this.state;
    const cost = mode === 'random' ? 8 : mode === 'add' ? 10 : mode === 'book' ? 3 : 0;
    if (target?.kind === 'base') return { ok: false, reason: '基地能力已迁至信标，请点击基地信标升级', cost };
    if (!['playing', 'paused'].includes(s.phase)) return { ok: false, reason: '当前不能附魔', cost };
    if (!['random', 'add', 'book'].includes(mode)) return { ok: false, reason: '附魔方式不存在', cost };
    if (!(mode === 'random' ? s.stations.enchantingTable : s.stations.anvil)) return { ok: false, reason: mode === 'random' ? '先合成附魔台' : '先合成铁砧', cost };
    const record = this._targetRecord(target);
    if (!record) return { ok: false, reason: '目标无效或被抓住', cost };
    const slots = Object.keys(record.bag).length;
    const candidates = this._enchantPool(target).filter(id => (record.bag[id] || 0) < UPGRADES.find(u => u.id === id).maxLevel && (record.bag[id] || slots < 4));
    if (mode === 'book' && (!(s.books[bookId] > 0) || !candidates.includes(bookId))) return { ok: false, reason: '没有这本书、目标不适用或附魔已满', cost };
    if (mode === 'add' && !candidates.length) return { ok: false, reason: '附魔种类和等级已满', cost };
    if (s.xp < cost) return { ok: false, reason: '经验不足', cost };
    return { ok: true, reason: '', cost, candidates, name: record.name };
  }

  getEnchantOptions(target) {
    return { ...this.describeEnchantTarget(target), random: this.canEnchant(target, 'random'), add: this.canEnchant(target, 'add'), books: Object.keys(this.state.books).filter(id => this.state.books[id] > 0).map(id => ({ id, count: this.state.books[id], ...this.canEnchant(target, 'book', id) })) };
  }

  enchant(target, mode, bookId = null) {
    const check = this.canEnchant(target, mode, bookId);
    if (!check.ok) return false;
    this.cancelAim();
    const s = this.state;
    const record = this._targetRecord(target);
    const bag = mode === 'random' ? {} : { ...record.bag };
    if (mode === 'random') {
      const pool = this._enchantPool(target);
      for (let i = 0; i < 2; i += 1) bag[pool.splice(Math.min(pool.length - 1, Math.floor(this.random() * pool.length)), 1)[0]] = 1;
    } else {
      const id = mode === 'book' ? bookId : check.candidates[Math.min(check.candidates.length - 1, Math.floor(this.random() * check.candidates.length))];
      bag[id] = (bag[id] || 0) + 1;
    }
    s.xp -= check.cost;
    if (mode === 'book') s.books[bookId] -= 1;
    if (target.kind === 'rod') s.rodEnchantments[target.id] = bag;
    else if (target.kind === 'ball') record.ball.enchantments = bag;
    else { s.baseEnchantments = bag; this._syncBaseStats(); }
    this._syncStats();
    for (const ball of s.balls) { ball.turretActive = this._isTurret(ball); if (ball.turretActive) { ball.vx = ball.vy = 0; this._clearRicochet(ball); } }
    this.onEvent({ type: 'enchant', x: record.ball?.x || CX, y: record.ball?.y || CY, target: { ...target }, mode, enchantments: { ...bag } });
    return true;
  }

  _refreshBookOffers(initial = false) {
    const s = this.state;
    const pool = [...BOOK_IDS];
    const ids = initial ? ['power', 'frost_touch'] : [];
    if (!initial) {
      const count = this.random() < 0.3 ? 3 : 2;
      for (let i = 0; i < count; i += 1) ids.push(pool.splice(Math.min(pool.length - 1, Math.floor(this.random() * pool.length)), 1)[0]);
    }
    s.bookOffers = ids.map(id => ({ id, enchantId: id, name: `${UPGRADES.find(u => u.id === id).name}附魔书`, cost: ['steam_burst', 'looting', 'storm_link'].includes(id) ? { iron: 2, stone: 2 } : { wood: 2, stone: 2 }, stock: 1 }));
    this._refreshShopOffers();
  }

  _refreshShopOffers() {
    const s = this.state;
    s.shopOffers = [
      { id: 'wood_bundle', name: '木材包 ×3', category: 'materials', icon: '▥', cost: { stone: 2 }, stock: 2, materials: { wood: 3 } },
      { id: 'stone_bundle', name: '石料包 ×4', category: 'materials', icon: '▣', cost: { wood: 2 }, stock: 2, materials: { stone: 4 } },
      { id: 'iron_bundle', name: '铁锭包 ×2', category: 'materials', icon: '◆', cost: { gold: 1, stone: 2 }, stock: 2, materials: { iron: 2 } },
      { id: 'slime_bundle', name: '粘液球 ×3', category: 'materials', icon: '●', cost: { iron: 1, stone: 2 }, stock: 1, materials: { slimeBall: 3 } },
      { id: 'potion_ready', name: '成品治疗药水', category: 'items', icon: '✚', cost: { gold: 1, bone: 1 }, stock: 2, item: 'potion', quantity: 1 },
      { id: 'snowball_ready', name: '成品冰霜雪球', category: 'items', icon: '❄', cost: { wood: 1, stone: 1 }, stock: 2, item: 'snowball', quantity: 1 },
      { id: 'hire_snow_golem', name: '雇佣雪傀儡', category: 'allies', icon: '☃', cost: { iron: 2, wood: 2 }, stock: 1, ally: 'snow_golem' },
      ...s.bookOffers.map(book => ({ id: `book:${book.enchantId}`, enchantId: book.enchantId, name: book.name, category: 'books', icon: '▤', cost: { ...book.cost }, stock: book.stock })),
    ];
    if (s.stage === 'overworld') s.shopOffers.splice(3, 0, { id: 'obsidian_bundle', name: '黑曜石 ×2', category: 'materials', icon: '▣', cost: { iron: 2, stone: 4 }, stock: 1, materials: { obsidian: 2 } });
    if (s.stage === 'nether') s.shopOffers.splice(3, 0, { id: 'pearl_bundle', name: '末影珍珠 ×2', category: 'materials', icon: '●', cost: { gold: 2, quartz: 3 }, stock: 1, materials: { endPearl: 2 } });
  }

  canBuy(id) {
    const s = this.state;
    if (!['playing', 'paused'].includes(s.phase)) return { ok: false, reason: '当前不能交易' };
    const offer = s.shopOffers.find(item => item.id === id);
    if (!offer) return { ok: false, reason: '商品不存在' };
    if (offer.enchantId && !BOOK_IDS.includes(offer.enchantId)) return { ok: false, reason: '基地能力请到信标升级' };
    if (offer.ally === 'snow_golem' && s.stage === 'nether') return { ok: false, reason: '下界高温会融化雪傀儡，无法在此雇佣' };
    const stock = offer.enchantId ? s.bookOffers.find(book => book.enchantId === offer.enchantId)?.stock : offer.stock;
    if (!(stock > 0)) return { ok: false, reason: '本波库存已售完' };
    if (offer.ally && s.allies.filter(ally => ally.kind === offer.ally && ally.hp > 0).length >= 2) return { ok: false, reason: '这种傀儡最多两只' };
    if (Object.entries(offer.cost).some(([key, amount]) => (s.materials[key] || 0) < amount)) return { ok: false, reason: '交易材料不足', cost: offer.cost };
    return { ok: true, reason: '', cost: offer.cost };
  }

  buyOffer(id) {
    if (!this.canBuy(id).ok) return false;
    const s = this.state;
    const offer = s.shopOffers.find(item => item.id === id);
    if (offer.enchantId) return this.buyBook(offer.enchantId);
    for (const [key, amount] of Object.entries(offer.cost)) s.materials[key] -= amount;
    offer.stock -= 1;
    if (offer.materials) this._grantMaterials(offer.materials, CX, CY);
    if (offer.item) s.items[offer.item] = (s.items[offer.item] || 0) + (offer.quantity || 1);
    if (offer.ally) this._spawnAlly(offer.ally);
    this.onEvent({ type: 'purchase', x: CX, y: CY, id, name: offer.name });
    return true;
  }

  buyBook(enchantId) {
    const s = this.state;
    if (!['playing', 'paused'].includes(s.phase) || !BOOK_IDS.includes(enchantId)) return false;
    const offer = s.bookOffers.find(book => book.enchantId === enchantId && book.stock > 0);
    if (!offer || Object.entries(offer.cost).some(([key, value]) => (s.materials[key] || 0) < value)) return false;
    for (const [key, value] of Object.entries(offer.cost)) s.materials[key] -= value;
    offer.stock -= 1;
    const shopBook = s.shopOffers.find(item => item.enchantId === enchantId);
    if (shopBook) shopBook.stock = offer.stock;
    s.books[enchantId] = (s.books[enchantId] || 0) + 1;
    this.onEvent({ type: 'dropBook', x: CX, y: CY, enchantId, name: offer.name });
    return true;
  }

  canUseItem(id) {
    const s = this.state;
    if (id === 'tnt') return { ok: false, reason: 'TNT需要红石方块碰撞引爆' };
    if (!(id in s.items)) return { ok: false, reason: '道具不存在' };
    if (!(s.phase === 'playing' || (s.phase === 'paused' && ['potion', 'redstone_boost'].includes(id)))) return { ok: false, reason: '当前不能使用这个道具' };
    if (!(s.items[id] > 0)) return { ok: false, reason: '道具数量不足' };
    if (id === 'potion' && s.hp >= s.maxHp) return { ok: false, reason: '基地生命已满' };
    if (id === 'lightning_rod' && s.structures.filter(structure => structure.kind === 'lightning_rod').length >= 3) return { ok: false, reason: '最多放置三座避雷针' };
    return { ok: true, reason: '' };
  }

  useItem(id, x, y, ballId = null) {
    if (!this.canUseItem(id).ok) return false;
    const s = this.state;
    if (id === 'potion') return this.usePotion();
    if (id === 'redstone_boost') {
      s.items[id] -= 1;
      s.overchargeTimer = 10;
      this.onEvent({ type: 'pulse', x: CX, y: CY, radius: 160, color: '#ff6b76', source: id });
      return true;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    x = clamp(x, 30, 970); y = clamp(y, 30, 690);
    if (id === 'lightning_rod') {
      if (length(x - CX, y - CY) < WORLD.baseRadius + 20) return false;
      s.items[id] -= 1;
      const structure = { id: this._id++, kind: 'lightning_rod', x: clamp(x, 45, 955), y: clamp(y, 45, 675), r: 12 };
      s.structures.push(structure);
      this.onEvent({ type: 'structureBuild', ...structure });
      return true;
    }
    if (id === 'ender_pearl') {
      const ball = ballId === null ? s.balls.find(b => b.type === 'cue') : s.balls.find(b => b.id === ballId);
      if (!ball || ball.type === 'ghost' || ball.life !== undefined || ball.heldBy) return false;
      this.cancelAim();
      const from = { x: ball.x, y: ball.y };
      this._clearRicochet(ball);
      Object.assign(ball, this._findBallPlacement(ball, x, y), { vx: 0, vy: 0 });
      s.items[id] -= 1;
      this.onEvent({ type: 'teleport', x: ball.x, y: ball.y, from, to: { x: ball.x, y: ball.y }, color: '#c084fc' });
      return true;
    }
    s.items[id] -= 1;
    if (id === 'snowball') {
      for (const enemy of s.enemies) if (enemy.hp > 0 && length(enemy.x - x, enemy.y - y) < 145) enemy.slowTimer = Math.max(enemy.slowTimer || 0, 4);
      this.onEvent({ type: 'pulse', x, y, radius: 145, source: id, color: '#a5d7ff' });
    } else if (id === 'fire_charge') {
      for (const ball of s.balls) if (ball.type !== 'ghost' && length(ball.x - x, ball.y - y) < 130) ball.fireTimer = Math.max(ball.fireTimer || 0, 6);
      this._areaDamage(x, y, 130, 34, '#ff9b45', id, 16);
    }
    return true;
  }

  usePotion() {
    const s = this.state;
    if (!['playing', 'paused'].includes(s.phase) || s.items.potion <= 0 || s.hp >= s.maxHp) return false;
    s.items.potion -= 1;
    s.hp = Math.min(s.maxHp, s.hp + 35);
    this.onEvent({ type: 'pulse', x: CX, y: CY, radius: 65, source: 'potion', color: '#86efac', value: 35 });
    return true;
  }

  // Retained only to reject older callers: TNT is armed exclusively by redstone collisions.
  useTnt() { return false; }

  clickQte(enemyId) {
    const s = this.state;
    if (s.phase !== 'playing' || !s.qte || s.qte.enemyId !== enemyId) return false;
    s.qte.remainingClicks -= 1;
    if (s.qte.remainingClicks <= 0) this._releaseHeld(enemyId, true);
    return true;
  }

  /** The grabbed block stays still; all other simulation systems consume scaled time. */
  advanceAim(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    if (this.state.phase !== 'playing') { this.cancelAim(); return 0; }
    const aim = this.state.aim;
    if (!aim) return 0;
    const ball = this.state.balls.find(candidate => candidate.id === aim.ballId);
    if (!ball || ball.heldBy || ball.detonated || !ball.aimHeld) { this.cancelAim(); return 0; }
    const before = this.state.elapsed;
    aim.chargeTime = Math.min(aim.chargeRequired || 0, (aim.chargeTime || 0) + dt);
    this.update(dt * aim.timeScale);
    const simulated = this.state.elapsed - before;
    this._shotCooldown = Math.max(0, this._shotCooldown - Math.max(0, dt - simulated));
    return simulated;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.state.phase !== 'playing' && this.state.aim) this.cancelAim();
    if (this.state.phase === 'transition') {
      const transition = this.state.transition;
      if (!transition) return;
      transition.elapsed = Math.min(transition.duration, transition.elapsed + dt);
      if (transition.elapsed >= transition.duration) this._changeStage(transition.to);
      return;
    }
    if (this.state.phase !== 'playing') return;
    let remaining = dt;
    while (remaining > 1e-9 && this.state.phase === 'playing') {
      const step = Math.min(STEP, remaining);
      this._step(step);
      remaining -= step;
    }
  }

  _step(dt) {
    const s = this.state;
    if (s.hp <= 0) { this._end('lost'); return; }
    if (this._isVictory()) { this._end('won'); return; }
    s.elapsed += dt;
    for (const beam of s.beams) beam.life -= dt;
    s.beams = s.beams.filter(beam => beam.life > 0);
    s.wave = 1 + Math.floor(s.elapsed / 30);
    this._updateExpedition(dt);
    if (s.phase === 'lost') return;
    const bookWave = `${s.stage}:${s.stageWave}`;
    if (bookWave !== this._bookOfferWave) { this._bookOfferWave = bookWave; this._refreshBookOffers(); }
    this._shotCooldown = Math.max(0, this._shotCooldown - dt);
    const cooldownRate = s.overchargeTimer > 0 ? 1.6 : 1;
    s.overchargeTimer = Math.max(0, s.overchargeTimer - dt);
    this._flameCooldown = Math.max(0, this._flameCooldown - dt * cooldownRate);
    for (const id of Object.keys(this._enchantCooldowns)) this._enchantCooldowns[id] = Math.max(0, this._enchantCooldowns[id] - dt * cooldownRate);
    s.pulseCooldown = Math.max(0, s.pulseCooldown - dt);
    s.recallCooldown = Math.max(0, s.recallCooldown - dt);
    s.comboTimer = Math.max(0, s.comboTimer - dt);
    if (s.comboTimer === 0) s.combo = 0;
    if (this._level('regen')) {
      s.regenTimer -= dt;
      if (s.regenTimer <= 1e-9) {
        s.regenTimer += 10;
        const healed = Math.min(s.maxHp - s.hp, this._level('regen') * 6);
        s.hp += healed;
        if (healed > 0) this.onEvent({ type: 'pulse', x: CX, y: CY, value: healed, color: '#86efac', radius: 65, source: 'regen' });
      }
    }

    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      const profile = this._spawnProfile();
      let anchor = null;
      for (let i = 0; i < profile.count; i += 1) {
        const { kind, extra } = this._chooseStageEnemy(profile);
        if (anchor) { extra.x = anchor.x + (i % 2 ? 28 : -28) * Math.ceil(i / 2); extra.y = anchor.y + (i % 2 ? 18 : -18); }
        const spawned = this._spawnEnemy(kind, extra);
        if (!anchor && spawned) anchor = { x: spawned.x, y: spawned.y };
      }
      this._spawnTimer += profile.interval;
    }
    this._updateResources(dt);
    this._updateBeacon(dt);
    Combat.updateCombat(this, dt);
    this._updateEnemies(dt);
    this._updateAllies(dt);
    Workers.updateWorkers(this, dt);
    if (s.phase === 'lost') {
      for (const enemy of s.enemies) if (enemy.hp > 0) this._containEnemy(enemy);
      return;
    }

    for (const ball of s.balls) {
      if (ball.life !== undefined) ball.life -= dt;
      ball.fireTimer = Math.max(0, (ball.fireTimer || 0) - dt);
      if (ball.ricochet) ball.ricochet.fireTimer = Math.max(0, ball.ricochet.fireTimer - dt);
      ball.sandTimer = Math.max(0, (ball.sandTimer || 0) - dt);
      if (ball.aimHeld) {
        if (s.aim?.ballId === ball.id) { ball.x = s.aim.x; ball.y = s.aim.y; ball.vx = 0; ball.vy = 0; continue; }
        delete ball.aimHeld;
      }
      if (ball.heldBy) {
        const holder = s.enemies.find(e => e.id === ball.heldBy && e.hp > 0);
        if (holder) { ball.x = holder.x; ball.y = holder.y - holder.r - ball.r; ball.vx = 0; ball.vy = 0; continue; }
        this._releaseHeld(ball.heldBy);
      }
      ball.turretActive = this._isTurret(ball);
      if (ball.turretActive) { ball.vx = ball.vy = 0; this._clearRicochet(ball); continue; }
      this._limit(ball, MAX_SPEED);
      const speed = length(ball.vx, ball.vy);
      const slime = effectiveTraitsOf(ball).includes('slime');
      const slowed = Math.max(0, speed * Math.exp(-(slime ? 0.07 : 0.18) * dt) - (ball.sandTimer > 0 ? 320 : slime ? 110 : 210) * dt);
      const factor = slowed < 20 || speed === 0 ? 0 : slowed / speed;
      ball.vx = factor === 0 ? 0 : ball.vx * factor;
      ball.vy = factor === 0 ? 0 : ball.vy * factor;
      if (factor === 0) this._clearRicochet(ball);
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.charge = Math.max(0, ball.charge - dt * 0.025);
      this._ballWalls(ball);
      this._ballBase(ball);
    }
    s.balls = s.balls.filter(b => b.life === undefined || b.life > 0);

    for (let i = 0; i < s.balls.length; i += 1) {
      const ball = s.balls[i];
      if (ball.heldBy || ball.aimHeld || (ball.life !== undefined && ball.life <= 0)) continue;
      for (let j = i + 1; j < s.balls.length; j += 1) if (!s.balls[j].heldBy && !s.balls[j].aimHeld) this._ballPair(ball, s.balls[j]);
      if (ball.detonated) continue;
      for (const enemy of s.enemies) if (enemy.hp > 0) this._ballEnemy(ball, enemy);
      for (const resource of s.resources) if (resource.hp > 0) this._ballResource(ball, resource);
      for (const crystal of s.crystals) if (crystal.hp > 0) this._ballCrystal(ball, crystal);
    }
    for (let i = 0; i < s.enemies.length; i += 1) {
      const a = s.enemies[i];
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < s.enemies.length; j += 1) {
        const b = s.enemies[j];
        if (b.hp > 0) this._enemyPair(a, b);
      }
    }
    s.balls = s.balls.filter(b => b.life === undefined || b.life > 0);
    s.enemies = s.enemies.filter(e => e.hp > 0);
    s.resources = s.resources.filter(r => r.hp > 0);
    this._updateProjectiles(dt);
    for (const ball of s.balls) {
      if (ball.aimHeld) continue;
      if (ball.heldBy || ball.detonated || length(ball.vx, ball.vy) < 20 || (ball.life !== undefined && ball.life <= 0)) this._clearRicochet(ball);
      else this._refreshRicochet(ball);
    }
    for (const enemy of s.enemies) if (enemy.hp > 0) this._containEnemy(enemy);
    this._collectExperience();
    if (s.hp <= 0) { this._end('lost'); return; }
    // Contact histories are short lived and bounded independently of session length.
    if (this._contacts.size > 600) {
      for (const [key, time] of this._contacts) if (time < s.elapsed - 1) this._contacts.delete(key);
    }
    for (const history of [this._buildCooldowns, this._elements]) if (history.size > 128) {
      for (const [key, time] of history) if (time < s.elapsed - 5) history.delete(key);
    }
    if (this._isVictory()) this._end('won');
    else this._checkLevel();
  }

  _isVictory() { return this.state.stage === 'end' && this.state.bossesDefeated.includes('dragon'); }
  _allBossesDefeated() { return this._isVictory(); }

  _newBall(type, x, y) {
    return {
      id: this._id++, type, x, y, vx: 0, vy: 0,
      r: type === 'tnt' ? 15 : type === 'iron' ? 16 : type === 'gold' ? 14 : type === 'ghost' ? 8 : ['frost', 'slime'].includes(type) ? 13 : 12,
      mass: type === 'tnt' ? 1.2 : type === 'iron' ? 3.25 : type === 'gold' ? 2 : type === 'ghost' ? 0.55 : type === 'frost' ? 1.25 : 1,
      charge: 0,
      beaconRicochetBonus: 0,
      catchBonus: null, lastShotAt: -Infinity,
      ricochet: null,
      ricochetEpoch: 0,
      traits: TRAITS.includes(type) ? [type] : [], fusionLevel: 0, enchantments: {},
      shotRod: this.state?.activeRod || 'wood', shotEnchantments: { ...(this.state?.rodEnchantments?.[this.state?.activeRod] || {}) },
    };
  }

  _spawnEnemy(kind, extra = {}) {
    const s = this.state;
    s.enemies = s.enemies.filter(e => e.hp > 0);
    if (s.enemies.filter(e => e.hp > 0).length >= MAX_ENEMIES && !BOSS_KINDS.has(kind)) return null;
    if (s.enemies.length >= MAX_ENEMIES) {
      const disposable = s.enemies.findIndex(e => !BOSS_KINDS.has(e.kind) && e.id !== s.qte?.enemyId);
      if (disposable >= 0) s.enemies.splice(disposable, 1);
      else return null;
    }
    const edge = Math.floor(this.random() * 4);
    const t = 0.08 + this.random() * 0.84;
    let x = 55 + t * 890;
    let y = 55 + t * 610;
    if (edge === 0) y = 34;
    if (edge === 1) x = 966;
    if (edge === 2) y = 686;
    if (edge === 3) x = 34;
    const size = extra.size || 3;
    const difficulty = Math.min(10, s.stageWave);
    const special = {
      drowned: { r: 15, hp: 28, speed: 14 }, husk: { r: 16, hp: 34, speed: 14 },
      trident_drowned: { r: 16, hp: 40, speed: 12, attackCooldown: 3 },
      evoker: { r: 16, hp: 50, speed: 12, totalSummoned: 0, attackCooldown: 4 },
      vex: { r: 9, hp: 14, speed: 44, life: 14 },
      vindicator: { r: 16, hp: 48, speed: 21 }, witch: { r: 16, hp: 48, speed: 13, attackCooldown: 3 },
      zombified_piglin: { r: 16, hp: 40, speed: 15, wanderTimer: 0 },
      piglin_brute: { r: 20, hp: 100, speed: 17 },
      magma_cube: { r: 7 + size * 6, hp: size === 3 ? 64 : size === 2 ? 32 : 14, speed: 30 - size * 4, size },
      ghast: { r: 24, hp: 78, speed: 9, attackCooldown: 4 },
    };
    const data = special[kind] || (kind === 'boss' ? { r: 28, hp: 380, speed: 7.5 }
      : kind === 'wither' ? { r: 30, hp: 380, speed: 6 }
        : kind === 'dragon' ? { r: 37, hp: 650, speed: 8 }
          : kind === 'warden' ? { r: 31, hp: 900, speed: 6 }
            : kind === 'shield_zombie' ? { r: 17, hp: 35, speed: 13, shield: 42, maxShield: 42 }
              : kind === 'slime' ? { r: 7 + size * 6, hp: size === 3 ? 58 : size === 2 ? 30 : 12, speed: 29 - size * 4, size }
                : kind === 'enderman' ? { r: 16, hp: 54, speed: 21, teleportCooldown: 0, grabCooldown: 0 }
                  : kind === 'skeleton' ? { r: 14, hp: 26, speed: 16, attackCooldown: 3.5 }
                    : kind === 'blaze' ? { r: 17, hp: 58, speed: 12, attackCooldown: 4.5 }
                      : kind === 'creeper' ? { r: 15, hp: 32, speed: 16, fuse: null }
                        : kind === 'tank' ? { r: 21, hp: 84, speed: 15 }
                          : kind === 'runner' ? { r: 11, hp: 22, speed: 42 }
                            : { r: 15, hp: 23, speed: 13 + difficulty * 1.1 });
    const enemy = { id: this._id++, kind, x, y, vx: 0, vy: 0, flash: 0, chainLeft: 0, attackCooldown: 3, ...scaleEnemyStats(data, s.stageWave, extra) };
    this._containEnemy(enemy);
    s.enemies.push(enemy);
    return enemy;
  }

  _containEnemy(enemy) {
    const minX = WORLD.margin + enemy.r;
    const maxX = WORLD.width - WORLD.margin - enemy.r;
    const minY = WORLD.margin + enemy.r;
    const maxY = WORLD.height - WORLD.margin - enemy.r;
    if (!Number.isFinite(enemy.x)) enemy.x = CX;
    if (!Number.isFinite(enemy.y)) enemy.y = CY - 150;
    if (!Number.isFinite(enemy.vx)) enemy.vx = 0;
    if (!Number.isFinite(enemy.vy)) enemy.vy = 0;
    if (enemy.x < minX) { enemy.x = minX; if (enemy.vx < 0) enemy.vx = 0; }
    if (enemy.x > maxX) { enemy.x = maxX; if (enemy.vx > 0) enemy.vx = 0; }
    if (enemy.y < minY) { enemy.y = minY; if (enemy.vy < 0) enemy.vy = 0; }
    if (enemy.y > maxY) { enemy.y = maxY; if (enemy.vy > 0) enemy.vy = 0; }
  }

  _dropExperience(x, y, value) {
    const orbs = this.state.experienceOrbs;
    x = clamp(x, 40, 960); y = clamp(y, 40, 680);
    const fromBase = length(x - CX, y - CY);
    if (fromBase < WORLD.baseRadius + 8) {
      const nx = fromBase > 0.001 ? (x - CX) / fromBase : 0;
      const ny = fromBase > 0.001 ? (y - CY) / fromBase : 1;
      x = CX + nx * (WORLD.baseRadius + 8);
      y = CY + ny * (WORLD.baseRadius + 8);
    }
    if (orbs.length >= 160) {
      const closest = orbs.reduce((a, b) => length(a.x - x, a.y - y) <= length(b.x - x, b.y - y) ? a : b);
      closest.value += value;
      closest.r = Math.min(12, 4 + Math.sqrt(closest.value));
      return;
    }
    orbs.push({ id: this._id++, x, y, value, r: Math.min(12, 4 + Math.sqrt(value)) });
  }

  _collectExperience() {
    const s = this.state;
    if (s.phase !== 'playing') return;
    s.experienceOrbs = s.experienceOrbs.filter(orb => {
      if (!s.balls.some(ball => !ball.heldBy && !ball.aimHeld && (ball.life === undefined || ball.life > 0) && length(ball.x - orb.x, ball.y - orb.y) <= ball.r + orb.r + 12)) return true;
      this._gainExperience(orb);
      return false;
    });
  }

  _gainExperience(orb) {
    const s = this.state;
    s.xp += orb.value; s.totalXp += orb.value;
    while (s.totalXp >= this._totalXpThreshold) {
      this._levelStartXp = this._totalXpThreshold; s.level += 1; s.pendingUpgrades += 1;
      s.xpNext = s.level === 2 ? 9 : s.level === 3 ? 14 : 14 + (s.level - 3) * 5;
      this._totalXpThreshold += s.xpNext;
    }
    s.levelXp = s.totalXp - this._levelStartXp;
    this._event('xp', orb.x, orb.y, orb.value, '#a3e635');
  }

  _hurtBase(amount) {
    if (this._safeTntExplosion > 0) return;
    const s = this.state;
    const absorbed = Math.min(s.shield, amount);
    s.shield -= absorbed;
    s.hp = Math.max(0, s.hp - (amount - absorbed));
    this._event('hurt', CX, CY, amount, '#fb7185');
    if (s.hp <= 0) this._end('lost');
  }

  _updateEnemies(dt) {
    const s = this.state;
    for (const enemy of [...s.enemies]) {
      if (enemy.hp <= 0 || s.phase === 'lost') continue;
      if (enemy.life !== undefined) { enemy.life -= dt; if (enemy.life <= 0) { enemy.hp = 0; continue; } }
      enemy.flash = Math.max(0, (enemy.flash || 0) - dt);
      enemy.slowTimer = Math.max(0, (enemy.slowTimer || 0) - dt);
      enemy.stunTimer = Math.max(0, (enemy.stunTimer || 0) - dt);
      enemy.attackCooldown = Math.max(0, (enemy.attackCooldown || 0) - dt);
      if (enemy.kind === 'enderman') this._endermanAI(enemy, dt);
      const neutralPiglin = enemy.kind === 'zombified_piglin' && !s.piglinAggro;
      let goalX = CX; let goalY = CY; let goldTarget = null;
      if (neutralPiglin) {
        enemy.wanderTimer = (enemy.wanderTimer || 0) - dt;
        if (enemy.wanderTimer <= 0) { enemy.wanderTimer = 2; enemy.wanderAngle = this.random() * Math.PI * 2; }
        goalX = enemy.x + Math.cos(enemy.wanderAngle) * 100;
        goalY = enemy.y + Math.sin(enemy.wanderAngle) * 100;
        if (length(enemy.x - CX, enemy.y - CY) < 90) { goalX = enemy.x + (enemy.x - CX || 1); goalY = enemy.y + (enemy.y - CY); }
      }
      if (enemy.kind === 'piglin_brute') {
        goldTarget = s.balls.filter(ball => !ball.heldBy && !ball.detonated && ball.type !== 'ghost' && effectiveTraitsOf(ball).includes('gold')).sort((a, b) => length(a.x - enemy.x, a.y - enemy.y) - length(b.x - enemy.x, b.y - enemy.y))[0];
        if (goldTarget) { goalX = goldTarget.x; goalY = goldTarget.y; enemy.attractedTo = goldTarget.id; } else delete enemy.attractedTo;
      }
      const dx = goalX - enemy.x;
      const dy = goalY - enemy.y;
      const distance = length(dx, dy) || 1;
      const holding = s.qte?.enemyId === enemy.id;
      let moving = !holding && enemy.stunTimer <= 0;
      const ranged = ['skeleton', 'blaze', 'wither', 'ghast', 'trident_drowned'].includes(enemy.kind);
      if (ranged && distance < 220) moving = false;
      if (goldTarget && distance < enemy.r + goldTarget.r + 12) moving = false;
      if (enemy.kind === 'creeper') {
        if (distance < 125 && enemy.fuse == null) enemy.fuse = 1.6;
        if (enemy.fuse !== null && enemy.fuse !== undefined) {
          moving = false;
          enemy.fuse -= dt;
          if (enemy.fuse <= 0) { this._damage(enemy, enemy.hp + (enemy.shield || 0), '#86efac', null, 'environment'); continue; }
        }
      }
      const frostSlow = enemy.frostStacks === 2 ? 0.20 : enemy.frostStacks === 1 ? 0.50 : 0.28;
      const speed = moving ? enemy.speed * (enemy.slowTimer > 0 ? frostSlow : enemy.quakeSlowTimer > 0 ? 0.8 : 1) * (neutralPiglin ? 0.65 : 1) : 0;
      enemy.x += (dx / distance * speed + enemy.vx) * dt;
      enemy.y += (dy / distance * speed + enemy.vy) * dt;
      const drag = Math.exp(-3.2 * dt);
      enemy.vx *= drag;
      enemy.vy *= drag;
      if (!holding && !neutralPiglin && enemy.stunTimer <= 0 && enemy.attackCooldown <= 0) {
        const angle = Math.atan2(CY - enemy.y, CX - enemy.x);
        if (enemy.kind === 'evoker') {
          let available = Math.min(2, 8 - (enemy.totalSummoned || 0), 4 - s.enemies.filter(e => e.hp > 0 && e.summonerId === enemy.id).length, 12 - s.enemies.filter(e => e.hp > 0 && e.kind === 'vex').length);
          while (available-- > 0) {
            const vex = this._spawnEnemy('vex', { x: enemy.x + (available % 2 ? -25 : 25), y: enemy.y - 20, summonerId: enemy.id });
            if (vex) enemy.totalSummoned = (enemy.totalSummoned || 0) + 1;
          }
          enemy.attackCooldown = 6;
          this._event('summon', enemy.x, enemy.y, enemy.totalSummoned || 0, '#c4b5fd');
        } else if (enemy.kind === 'witch') {
          for (const ally of s.enemies) if (ally.hp > 0 && length(ally.x - enemy.x, ally.y - enemy.y) < 130) ally.hp = Math.min(ally.maxHp, ally.hp + 12);
          enemy.attackCooldown = 5;
          this.onEvent({ type: 'pulse', x: enemy.x, y: enemy.y, radius: 130, source: 'witch', color: '#e879f9', value: 12 });
        } else if (ranged) {
          const kind = enemy.kind === 'skeleton' ? 'arrow' : enemy.kind === 'trident_drowned' ? 'trident' : ['blaze', 'ghast'].includes(enemy.kind) ? 'fireball' : 'wither';
          const count = enemy.kind === 'wither' ? 3 : 1;
          const wetTrident = kind === 'trident' && ['rain', 'storm'].includes(s.weather);
          for (let i = 0; i < count; i += 1) this._spawnProjectile('enemy', kind, enemy.x, enemy.y, angle + (i - (count - 1) / 2) * 0.15, wetTrident ? 5 : enemy.kind === 'ghast' ? 5 : 3, kind === 'arrow' ? 165 : kind === 'trident' ? (wetTrident ? 230 : 190) : 130, { sourceId: enemy.id, sourceKind: enemy.kind, sourceX: enemy.x, sourceY: enemy.y, reflectable: enemy.kind === 'ghast', callsLightning: kind === 'trident' && s.weather === 'storm' });
          enemy.attackCooldown = enemy.kind === 'wither' ? 5 : ['blaze', 'ghast'].includes(enemy.kind) ? 5.5 : 4.5;
        } else if (enemy.kind === 'dragon') {
          for (let i = -1; i <= 1; i += 1) this._spawnProjectile('enemy', 'fireball', enemy.x, enemy.y, angle + i * 0.19, 4, 150);
          enemy.vx += Math.cos(angle) * 260;
          enemy.vy += Math.sin(angle) * 260;
          enemy.attackCooldown = 7;
        } else if (enemy.kind === 'warden' && distance < 210) {
          this.onEvent({ type: 'pulse', x: enemy.x, y: enemy.y, radius: 210, source: 'warden', color: '#67e8f9', value: 5 });
          this._hurtBase(5);
          enemy.attackCooldown = 4;
        }
      }
      if (length(enemy.x - CX, enemy.y - CY) <= WORLD.baseRadius + enemy.r && enemy.kind !== 'creeper' && !neutralPiglin) {
        const boss = BOSS_KINDS.has(enemy.kind);
        const hurt = enemy.kind === 'boss' ? s.maxHp : enemy.kind === 'warden' ? 28 : boss ? 18 : ['tank', 'vindicator', 'piglin_brute'].includes(enemy.kind) ? 12 : enemy.kind === 'magma_cube' ? 7 : ['runner', 'vex'].includes(enemy.kind) ? 4 : 5;
        this._hurtBase(hurt);
        if (enemy.kind === 'magma_cube') s.baseBurnTimer = Math.max(s.baseBurnTimer, 4);
        if (boss && s.hp > 0) {
          const d = length(enemy.x - CX, enemy.y - CY) || 1;
          const nx = (enemy.x - CX) / d;
          const ny = (enemy.y - CY) / d || -1;
          enemy.x = CX + nx * (WORLD.baseRadius + enemy.r + 50);
          enemy.y = CY + ny * (WORLD.baseRadius + enemy.r + 50);
          enemy.vx = nx * 130;
          enemy.vy = ny * 130;
        } else {
          enemy.hp = 0;
          enemy.escaped = true;
          this._releaseHeld(enemy.id);
        }
      }
      if (enemy.hp > 0) this._containEnemy(enemy);
    }
  }

  _endermanAI(enemy, dt) {
    const s = this.state;
    enemy.teleportCooldown = Math.max(0, (enemy.teleportCooldown || 0) - dt);
    enemy.grabCooldown = Math.max(0, (enemy.grabCooldown || 0) - dt);
    if (s.qte?.enemyId === enemy.id || enemy.stunTimer > 0) return;
    const nearby = s.balls.find(b => b.type !== 'ghost' && !b.heldBy && !b.aimHeld && length(b.x - enemy.x, b.y - enemy.y) < 62);
    if (nearby && !s.qte && enemy.grabCooldown <= 0) {
      this._clearRicochet(nearby);
      nearby.heldBy = enemy.id;
      nearby.vx = 0;
      nearby.vy = 0;
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.grabCooldown = 9;
      s.qte = { enemyId: enemy.id, ballId: nearby.id, remainingClicks: 7 };
      this.onEvent({ type: 'grab', x: enemy.x, y: enemy.y, enemyId: enemy.id, ballId: nearby.id });
      return;
    }
    if (enemy.teleportCooldown > 0) return;
    const threat = s.balls.find(ball => {
      const dx = enemy.x - ball.x;
      const dy = enemy.y - ball.y;
      const speed = length(ball.vx, ball.vy);
      return !ball.heldBy && !ball.aimHeld && speed > 180 && length(dx, dy) < 160 && dx * ball.vx + dy * ball.vy > 0 && Math.abs(dx * ball.vy - dy * ball.vx) / speed < enemy.r + ball.r + 12;
    });
    if (!threat) return;
    const from = { x: enemy.x, y: enemy.y };
    const speed = length(threat.vx, threat.vy) || 1;
    const side = this.random() < 0.5 ? -1 : 1;
    enemy.x = clamp(enemy.x - threat.vy / speed * 110 * side, 55, 945);
    enemy.y = clamp(enemy.y + threat.vx / speed * 110 * side, 55, 665);
    enemy.teleportCooldown = 6;
    this._containEnemy(enemy);
    this.onEvent({ type: 'teleport', x: enemy.x, y: enemy.y, from, to: { x: enemy.x, y: enemy.y }, color: '#c084fc' });
  }

  _releaseHeld(enemyId, kicked = false) {
    const s = this.state;
    for (const ball of s.balls) {
      if (ball.heldBy !== enemyId) continue;
      this._clearRicochet(ball);
      delete ball.heldBy;
      ball.vx = kicked ? 380 : 0;
      ball.vy = kicked ? -160 : 0;
    }
    if (s.qte?.enemyId === enemyId) s.qte = null;
    const enemy = s.enemies.find(e => e.id === enemyId);
    if (enemy && kicked) { enemy.stunTimer = 1.5; enemy.grabCooldown = 9; enemy.teleportCooldown = 3; }
  }

  _spawnProjectile(owner, kind, x, y, angle, damage, speed = 160, extra = {}) {
    if (this.state.projectiles.length >= MAX_PROJECTILES) return null;
    const p = { id: this._id++, owner, kind, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: ['arrow', 'trident'].includes(kind) ? 4 : 7, damage: damage * (kind === 'fireball' ? this._fireMultiplier() : 1), life: owner === 'ally' ? 2.5 : 7, ...extra };
    this.state.projectiles.push(p);
    return p;
  }

  _updateProjectiles(dt) {
    const s = this.state;
    for (const p of s.projectiles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.owner === 'enemy' && p.reflectable && !p.reflected) {
        const ball = s.balls.find(b => !b.heldBy && !b.aimHeld && !b.detonated && (b.life === undefined || b.life > 0) && length(b.x - p.x, b.y - p.y) < b.r + p.r);
        if (ball) {
          const incomingSpeed = length(ball.vx - p.vx, ball.vy - p.vy);
          this._recordRicochet(ball, incomingSpeed, `projectile:${p.id}`);
          const shooter = s.enemies.find(e => e.id === p.sourceId && e.hp > 0);
          const angle = Math.atan2((shooter?.y ?? p.sourceY ?? 40) - p.y, (shooter?.x ?? p.sourceX ?? 40) - p.x);
          const speed = Math.max(240, length(p.vx, p.vy) * 1.5);
          p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
          p.owner = 'ally'; p.reflected = true; p.reflectedBy = ball.id; p.damage = 45 * this._fireMultiplier() * describeRicochet(ball).multiplier * describeCatch(ball).multiplier; p.life = 6;
          const elasticity = this._restitution(ball, 0.75);
          ball.vx = -ball.vx * elasticity; ball.vy = -ball.vy * elasticity;
          if (length(ball.vx, ball.vy) < 100) { ball.vx = -Math.cos(angle) * 170; ball.vy = -Math.sin(angle) * 170; }
          p.x = ball.x + Math.cos(angle) * (ball.r + p.r + 2); p.y = ball.y + Math.sin(angle) * (ball.r + p.r + 2);
          this.onEvent({ type: 'reflect', x: p.x, y: p.y, ballId: ball.id, sourceId: p.sourceId, color: '#ffbd69' });
        }
      }
      if (p.owner === 'ally') {
        const target = s.enemies.find(e => e.hp > 0 && length(e.x - p.x, e.y - p.y) < e.r + p.r);
        if (target) {
          if (p.kind === 'snowball') target.slowTimer = Math.max(target.slowTimer || 0, 2.2);
          this._damage(target, p.damage, p.kind === 'fireball' ? '#ff9b45' : '#d9f4ff', s.balls.find(b => b.id === p.reflectedBy), 'player', { burning: p.kind === 'fireball', angle: Math.atan2(p.vy, p.vx) });
          p.life = 0;
        }
      } else {
        const ally = s.allies.find(a => a.hp > 0 && length(a.x - p.x, a.y - p.y) < a.r + p.r);
        if (ally) { ally.hp = Math.max(0, ally.hp - p.damage); p.life = 0; if (p.callsLightning) this._strikeLightning(ally.x, ally.y); }
        else if (length(p.x - CX, p.y - CY) <= WORLD.baseRadius + p.r) { this._hurtBase(p.damage); p.life = 0; if (p.callsLightning) this._strikeLightning(CX, CY); }
      }
      if (p.x < 0 || p.x > WORLD.width || p.y < 0 || p.y > WORLD.height) p.life = 0;
    }
    s.projectiles = s.projectiles.filter(p => p.life > 0);
  }

  _spawnAlly(kind) {
    const same = this.state.allies.filter(a => a.kind === kind).length;
    const iron = kind === 'iron_golem';
    const hp = iron ? 160 : 65;
    const ally = { id: this._id++, kind, x: CX + (iron ? -85 : 85), y: CY + (same === 0 ? -55 : 55), r: iron ? 20 : 15, hp, maxHp: hp, attackCooldown: 0, vx: 0, vy: 0 };
    if (kind === 'snow_golem' && this.state.stage === 'nether') { this._meltAlly(ally); return null; }
    this.state.allies.push(ally);
    return ally;
  }

  _meltAlly(ally) {
    if (!ally || ally.kind !== 'snow_golem' || ally.hp <= 0) return false;
    ally.hp = 0;
    this.onEvent({ type: 'allyMelt', id: ally.id, x: ally.x, y: ally.y, kind: ally.kind, reason: '下界高温', stage: 'nether' });
    return true;
  }

  _updateAllies(dt) {
    const s = this.state;
    for (const ally of s.allies) {
      if (ally.hp <= 0) continue;
      if (ally.kind === 'snow_golem' && s.stage === 'nether') { this._meltAlly(ally); continue; }
      ally.attackCooldown = Math.max(0, ally.attackCooldown - dt);
      let target = null;
      let distance = ally.kind === 'iron_golem' ? 500 : 360;
      for (const enemy of s.enemies) {
        const d = length(enemy.x - ally.x, enemy.y - ally.y);
        if (enemy.hp > 0 && d < distance) { target = enemy; distance = d; }
      }
      if (!target) continue;
      const angle = Math.atan2(target.y - ally.y, target.x - ally.x);
      if (ally.kind === 'iron_golem' && distance > ally.r + target.r + 10) {
        ally.x = clamp(ally.x + Math.cos(angle) * 68 * dt, 50, 950);
        ally.y = clamp(ally.y + Math.sin(angle) * 68 * dt, 50, 670);
      }
      if (ally.attackCooldown <= 0) {
        if (ally.kind === 'snow_golem') {
          this._spawnProjectile('ally', 'snowball', ally.x, ally.y, angle, 7, 340);
          ally.attackCooldown = 1.15 / (1 + (s.beacon.upgrades.haste || 0) * 0.18);
        } else if (distance < ally.r + target.r + 18) {
          this._damage(target, 25, '#d5d9df');
          target.vx += Math.cos(angle) * 100;
          target.vy += Math.sin(angle) * 100;
          target.chainLeft = 2;
          ally.attackCooldown = 0.85 / (1 + (s.beacon.upgrades.haste || 0) * 0.18);
        }
      }
      for (const enemy of s.enemies) {
        if (enemy.hp > 0 && length(enemy.x - ally.x, enemy.y - ally.y) < enemy.r + ally.r && this._contactReady(`ally${ally.id}e${enemy.id}`, 0.8)) ally.hp = Math.max(0, ally.hp - (BOSS_KINDS.has(enemy.kind) ? 9 : 3));
      }
    }
    s.allies = s.allies.filter(a => a.hp > 0);
  }

  _spawnResource(kind, x, y, materialOverride = null) {
    const s = this.state;
    if (s.resources.filter(r => r.hp > 0).length >= MAX_RESOURCES) return null;
    const fixed = Number.isFinite(x) && Number.isFinite(y);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const px = fixed ? x : 85 + this.random() * 830;
      const py = fixed ? y : 85 + this.random() * 550;
      if (length(px - CX, py - CY) < 115 || s.resources.some(r => r.hp > 0 && length(r.x - px, r.y - py) < 65)) { if (fixed) return null; continue; }
      const cycle = s.stage === 'nether' ? ['quartz', 'netherite', 'gold', 'endPearl', 'quartz', 'netherite', 'endPearl'] : ['diamond', 'obsidian', 'iron', 'obsidian', 'gold', 'obsidian', 'diamond', 'obsidian', 'iron', 'obsidian'];
      const material = kind === 'ore' ? materialOverride || (fixed ? 'iron' : cycle[this._oreCount % cycle.length]) : undefined;
      const mining = describeResource({ kind, material });
      const hp = mining.maxHp;
      const resource = { id: this._id++, kind, x: px, y: py, r: kind === 'tree' ? 20 : 18, hp, maxHp: hp, flash: 0, hardness: mining.hardness, fallTimer: kind === 'ore' && !fixed ? 0.8 : 0, ...(material ? { material } : {}) };
      if (kind === 'ore' && !fixed) this._oreCount += 1;
      s.resources.push(resource);
      if (resource.fallTimer > 0) this.onEvent({ type: 'oreFall', x: px, y: py, id: resource.id, duration: 0.8 });
      return resource;
    }
    return null;
  }

  _updateResources(dt) {
    if (this.state.stage !== 'end') {
      this._treeTimer -= dt;
      this._oreTimer -= dt;
      if (this._treeTimer <= 0) { this._treeTimer += 14; this._spawnResource('tree'); }
      if (this._oreTimer <= 0) { this._oreTimer += this.state.stage === 'nether' ? 12 : 14; this._spawnResource('ore'); }
    }
    for (const resource of this.state.resources) {
      resource.fallTimer = Math.max(0, (resource.fallTimer || 0) - dt);
      resource.flash = Math.max(0, (resource.flash || 0) - dt);
    }
  }

  _ballResource(ball, resource) {
    if (ball.aimHeld || this._isTurret(ball)) return;
    if (resource.fallTimer > 0) return;
    const dx = resource.x - ball.x;
    const dy = resource.y - ball.y;
    const d = length(dx, dy);
    if (d >= ball.r + resource.r) return;
    const nx = d > 0.001 ? dx / d : 1;
    const ny = d > 0.001 ? dy / d : 0;
    const closing = ball.vx * nx + ball.vy * ny;
    const overlap = ball.r + resource.r - d + 0.05;
    ball.x -= nx * overlap;
    ball.y -= ny * overlap;
    if (closing <= 0) return;
    const restitution = this._restitution(ball, 0.65, 0.98);
    ball.vx -= nx * closing * (1 + restitution);
    ball.vy -= ny * closing * (1 + restitution);
    const pickaxe = PICKAXES.find(tool => tool.id === this.state.pickaxe) || PICKAXES[0];
    if (closing < 50 || !this._contactReady(`r${resource.id}b${ball.id}:${ball.ricochetEpoch || 0}`, pickaxe.hitCooldown)) return;
    this._recordRicochet(ball, closing, `resource:${resource.id}`);
    const damage = this._miningDamage(ball, resource, closing);
    this._damageResource(resource, damage, { sourceBall: ball, angle: Math.atan2(ny, nx), impactSpeed: closing });
  }

  _miningDamage(ball, resource, incomingSpeed) {
    const pickaxe = PICKAXES.find(tool => tool.id === this.state.pickaxe) || PICKAXES[0];
    const info = describeResource(resource);
    const base = 8 + Math.min(MAX_SPEED, Math.max(0, incomingSpeed)) * 0.027;
    const combatBonus = Math.min(0.2, this._level('power', ball) * 0.025 + Math.min(1, describeRicochet(ball).damageBonus) * 0.05 + (ball.fusionLevel || 0) * 0.02 + (effectiveTraitsOf(ball).includes('iron') ? 0.04 : 0));
    return Math.max(0.1, base * pickaxe.multiplier * (info.hardness >= 30 ? pickaxe.hardMultiplier : 1) * (1 + combatBonus));
  }

  getWorkerMiningDamage(worker, resource) {
    const tool = PICKAXES.find(pickaxe => pickaxe.id === worker?.tool) || PICKAXES[1];
    const info = describeResource(resource);
    return Math.max(0.1, (8 + 650 * 0.027) * tool.multiplier * (info.hardness >= 30 ? tool.hardMultiplier : 1));
  }

  _damageResource(resource, damage, meta = {}) {
    if (resource.hp <= 0 || resource.fallTimer > 0 || !Number.isFinite(damage) || damage <= 0) return;
    const info = describeResource(resource);
    if (meta.explosive) damage *= 1 - info.blastResistance;
    resource.hp = Math.max(0, resource.hp - damage);
    resource.flash = 0.12;
    this.onEvent({ type: 'hit', x: resource.x, y: resource.y, value: Math.round(damage), color: resource.kind === 'tree' ? '#8fbb57' : '#c5c9cd', target: 'resource', combo: 0, crit: false, burning: Boolean(meta.sourceBall && this._isBurning(meta.sourceBall)), shield: false, kind: resource.kind, material: info.material, broken: resource.hp <= 0, sourceBallId: meta.sourceBall?.id ?? null, sourceWorkerId: meta.sourceWorkerId ?? null, workerRole: meta.workerRole ?? null, damageSource: meta.source || 'ball', angle: meta.angle ?? (meta.sourceBall ? Math.atan2(resource.y - meta.sourceBall.y, resource.x - meta.sourceBall.x) : 0), explosive: Boolean(meta.explosive), impactSpeed: meta.impactSpeed || 0 });
    if (resource.hp <= 0) {
      resource.hp = 0;
      const material = resource.material || 'iron';
      const oreDrops = material === 'netherite' ? { stone: 3, netheriteScrap: 2 } : { stone: 3, [material]: ['gold', 'quartz'].includes(material) ? 3 : 2 };
      this._grantMaterials(resource.kind === 'tree' ? { wood: 3 } : oreDrops, resource.x, resource.y);
    }
  }

  _ballCrystal(ball, crystal) {
    if (ball.aimHeld || this._isTurret(ball)) return;
    const dx = crystal.x - ball.x; const dy = crystal.y - ball.y;
    const distance = length(dx, dy);
    if (distance >= ball.r + crystal.r) return;
    const nx = distance > 0.001 ? dx / distance : 1;
    const ny = distance > 0.001 ? dy / distance : 0;
    const closing = ball.vx * nx + ball.vy * ny;
    const overlap = ball.r + crystal.r - distance + 0.05;
    ball.x -= nx * overlap; ball.y -= ny * overlap;
    if (closing <= 0) return;
    const restitution = this._restitution(ball, 0.7, 0.98);
    ball.vx -= nx * closing * (1 + restitution); ball.vy -= ny * closing * (1 + restitution);
    if (closing > 50 && this._contactReady(`c${crystal.id}b${ball.id}:${ball.ricochetEpoch || 0}`, 0.18)) {
      this._recordRicochet(ball, closing, `crystal:${crystal.id}`);
      this._damageCrystal(crystal, (12 + closing * 0.028) * this._impactMultiplier(ball), ball, { angle: Math.atan2(ny, nx), impactSpeed: closing });
    }
  }

  _damageCrystal(crystal, amount, sourceBall = null, meta = {}) {
    if (crystal.hp <= 0) return;
    const absorbed = Math.min(crystal.shield, amount);
    crystal.shield -= absorbed;
    crystal.hp = Math.max(0, crystal.hp - (amount - absorbed));
    this.onEvent({ type: 'hit', x: crystal.x, y: crystal.y, value: Math.round(amount), color: crystal.shield > 0 ? '#8b72b5' : '#f0abfc', target: 'crystal', combo: 0, crit: false, burning: Boolean(sourceBall && this._isBurning(sourceBall)), shield: absorbed > 0, shieldRemaining: crystal.shield, shieldBroken: absorbed > 0 && crystal.shield === 0, kind: 'end_crystal', material: absorbed > 0 ? 'obsidian' : 'end_crystal', broken: crystal.hp <= 0, sourceBallId: sourceBall?.id ?? null, angle: meta.angle ?? (sourceBall ? Math.atan2(crystal.y - sourceBall.y, crystal.x - sourceBall.x) : 0), explosive: Boolean(meta.explosive), impactSpeed: meta.impactSpeed || 0 });
    if (crystal.hp <= 0) this.onEvent({ type: 'crystalBreak', x: crystal.x, y: crystal.y, id: crystal.id });
    this._ensureDragon();
    this.state.objective = this.getObjective();
  }

  _ensureDragon() {
    const s = this.state;
    if (s.stage === 'end' && s.crystals.length === 4 && s.crystals.every(crystal => crystal.hp <= 0) && !s.bossesSpawned.includes('dragon')) this._spawnBoss('dragon');
  }

  _grantMaterials(drops, x, y) {
    for (const [material, amount] of Object.entries(drops)) this.state.materials[material] = (this.state.materials[material] || 0) + amount;
    this.state.objective = this.getObjective();
    if (Object.keys(drops).length) this.onEvent({ type: 'gather', x, y, drops, value: Object.values(drops).reduce((a, b) => a + b, 0) });
  }

  _limit(body, max) {
    const speed = length(body.vx, body.vy);
    if (speed > max) { body.vx *= max / speed; body.vy *= max / speed; }
  }

  _bounce(ball, incomingSpeed, contact) {
    const counted = this._recordRicochet(ball, incomingSpeed, contact);
    this._event('bounce', ball.x, ball.y, ball.charge, COLORS[ball.type]);
    return counted;
  }

  _ballWalls(ball) {
    if (ball.aimHeld) return;
    const minX = WORLD.margin + ball.r;
    const maxX = WORLD.width - WORLD.margin - ball.r;
    const minY = WORLD.margin + ball.r;
    const maxY = WORLD.height - WORLD.margin - ball.r;
    let bounced = false;
    let incomingSpeed = 0;
    const restitution = this._restitution(ball, 0.8);
    if (ball.x < minX) { ball.x = minX; if (ball.vx < 0) { incomingSpeed = Math.max(incomingSpeed, -ball.vx); ball.vx *= -restitution; bounced = true; } }
    if (ball.x > maxX) { ball.x = maxX; if (ball.vx > 0) { incomingSpeed = Math.max(incomingSpeed, ball.vx); ball.vx *= -restitution; bounced = true; } }
    if (ball.y < minY) { ball.y = minY; if (ball.vy < 0) { incomingSpeed = Math.max(incomingSpeed, -ball.vy); ball.vy *= -restitution; bounced = true; } }
    if (ball.y > maxY) { ball.y = maxY; if (ball.vy > 0) { incomingSpeed = Math.max(incomingSpeed, ball.vy); ball.vy *= -restitution; bounced = true; } }
    if (bounced) this._bounce(ball, incomingSpeed, 'wall');
  }

  _ballBase(ball) {
    if (ball.aimHeld) return;
    const dx = ball.x - CX;
    const dy = ball.y - CY;
    const d = length(dx, dy);
    const reach = WORLD.baseRadius + ball.r;
    if (d >= reach) return;
    const nx = d > 0.001 ? dx / d : 0;
    const ny = d > 0.001 ? dy / d : 1;
    ball.x = CX + nx * (reach + 0.05);
    ball.y = CY + ny * (reach + 0.05);
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      const restitution = this._restitution(ball, 0.85);
      ball.vx -= (1 + restitution) * dot * nx;
      ball.vy -= (1 + restitution) * dot * ny;
      const counted = this._bounce(ball, -dot, 'base');
      const s = this.state;
      if (counted && s.beacon.upgrades.base_ricochet > 0) {
        ball.beaconRicochetBonus = Math.min(Number.MAX_SAFE_INTEGER, (ball.beaconRicochetBonus || 0) + s.beacon.upgrades.base_ricochet * 0.12);
        this.onEvent({ type: 'beaconBounce', x: ball.x, y: ball.y, sourceBallId: ball.id, value: ball.beaconRicochetBonus, color: '#67e8f9' });
      }
      if (dot < -55 && this._level('pulse') && s.pulseCooldown <= 0) {
        s.pulseCooldown = 2;
        this._areaDamage(CX, CY, 145 + this._level('pulse') * 25, 18 + this._level('pulse') * 14, '#5eead4', 'base', 16);
      }
    }
  }

  _ballPair(a, b) {
    if (a.heldBy || b.heldBy || a.aimHeld || b.aimHeld || a.detonated || b.detonated || (a.life !== undefined && a.life <= 0) || (b.life !== undefined && b.life <= 0)) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = length(dx, dy);
    const reach = a.r + b.r;
    if (d >= reach) return;
    const nx = d > 0.001 ? dx / d : 1;
    const ny = d > 0.001 ? dy / d : 0;
    const overlap = reach - d + 0.04;
    const staticA = this._isTurret(a), staticB = this._isTurret(b);
    if (staticA && staticB) return;
    const massA = this._ballMass(a); const massB = this._ballMass(b);
    const total = massA + massB;
    if (!staticA) { a.x -= nx * overlap * (staticB ? 1 : massB / total); a.y -= ny * overlap * (staticB ? 1 : massB / total); }
    if (!staticB) { b.x += nx * overlap * (staticA ? 1 : massA / total); b.y += ny * overlap * (staticA ? 1 : massA / total); }
    const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (closing >= 0) return;
    const tnt = a.type === 'tnt' && effectiveTraitsOf(b).includes('storm') ? a : b.type === 'tnt' && effectiveTraitsOf(a).includes('storm') ? b : null;
    if (tnt && closing < -80) { this._detonateTnt(tnt); return; }
    const slimePair = effectiveTraitsOf(a).includes('slime') || effectiveTraitsOf(b).includes('slime');
    const restitution = Math.min(slimePair ? 0.995 : 1, 0.9 + 0.025 * Math.max(this._level('elasticity', a), this._level('elasticity', b)) + (slimePair ? 0.07 + Math.min(2, Math.max(0, (this.state.upgrades.slime || 1) - 1)) * 0.01 : 0));
    const impulse = -(1 + restitution) * closing / ((staticA ? 0 : 1 / massA) + (staticB ? 0 : 1 / massB));
    if (!staticA) { a.vx -= impulse * nx / massA; a.vy -= impulse * ny / massA; }
    if (!staticB) { b.vx += impulse * nx / massB; b.vy += impulse * ny / massB; }
    this._limit(a, MAX_SPEED);
    this._limit(b, MAX_SPEED);
    const pairKey = [a, b].sort((first, second) => first.id - second.id).map(ball => `${ball.id}.${ball.ricochetEpoch || 0}`).join(':');
    if (-closing >= 80 && this._contactReady(`chainpair:${pairKey}`, 0.12)) {
      this._recordRicochet(a, -closing, `ball:${b.id}`);
      this._recordRicochet(b, -closing, `ball:${a.id}`);
      this._mergeRicochetChains(a, b);
    }
    if (-closing > 55) {
      this._event('bounce', (a.x + b.x) / 2, (a.y + b.y) / 2, -closing, COLORS[b.type]);
      this._element(a, (18 + -closing * 0.015) * this._impactMultiplier(a));
      this._element(b, (18 + -closing * 0.015) * this._impactMultiplier(b));
    }
  }

  _detonateTnt(ball) {
    if (ball.type !== 'tnt' || ball.detonated || ball.heldBy || ball.aimHeld) return false;
    this._clearRicochet(ball);
    ball.detonated = true;
    ball.life = 0;
    ball.vx = 0;
    ball.vy = 0;
    this._safeTntExplosion += 1;
    try {
      this._areaDamage(ball.x, ball.y, 150, 140, '#ff9b45', 'tnt', 24, ball);
      for (const resource of this.state.resources) if (length(resource.x - ball.x, resource.y - ball.y) <= 150) this._damageResource(resource, 140, { sourceBall: ball, explosive: true });
      for (const crystal of this.state.crystals) if (length(crystal.x - ball.x, crystal.y - ball.y) <= 150) this._damageCrystal(crystal, 140, ball, { explosive: true });
    } finally {
      this._safeTntExplosion -= 1;
    }
    return true;
  }

  _ballEnemy(ball, enemy) {
    if (ball.aimHeld || this._isTurret(ball)) return;
    const dx = enemy.x - ball.x;
    const dy = enemy.y - ball.y;
    const d = length(dx, dy);
    const reach = ball.r + enemy.r;
    if (d >= reach) return;
    if (['blaze', 'magma_cube'].includes(enemy.kind)) ball.fireTimer = 5;
    if (enemy.kind === 'husk') ball.sandTimer = 2.5;
    const nx = d > 0.001 ? dx / d : 1;
    const ny = d > 0.001 ? dy / d : 0;
    const closing = (ball.vx - enemy.vx) * nx + (ball.vy - enemy.vy) * ny;
    const overlap = reach - d + 0.1;
    ball.x -= nx * overlap * 0.65;
    ball.y -= ny * overlap * 0.65;
    enemy.x += nx * overlap * 0.35;
    enemy.y += ny * overlap * 0.35;
    if (closing <= 15) return;
    const factor = 1 + this._restitution(ball, effectiveTraitsOf(ball).includes('iron') ? 0.14 : 0.65, 0.98);
    ball.vx -= nx * closing * factor;
    ball.vy -= ny * closing * factor;
    const resistance = BOSS_KINDS.has(enemy.kind) ? 5 : ['tank', 'shield_zombie'].includes(enemy.kind) ? 2.4 : 1;
    const impulse = closing * 0.7 * (1 + this._level('knockback', ball) * 0.3) * (ball.shotRod === 'bone' ? 1.2 : 1) * Math.sqrt(this._ballMass(ball)) / resistance;
    enemy.vx += nx * impulse;
    enemy.vy += ny * impulse;
    this._limit(enemy, 650);
    enemy.chainLeft = 3;
    enemy.sourceBallId = ball.id;
    if (closing < 50 || !this._contactReady(`b${ball.id}e${enemy.id}:${ball.ricochetEpoch || 0}`, 0.16)) return;
    this._recordRicochet(ball, closing, `enemy:${enemy.id}`);
    const s = this.state;
    let damage = (12 + Math.min(1200, closing) * 0.028) * this._impactMultiplier(ball);
    const crit = this.random() < Math.min(0.95, 0.05 + this._level('crit', ball) * 0.1);
    if (crit) damage *= 2;
    s.combo += 1;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.comboTimer = 2.8;
    this._damage(enemy, damage, COLORS[ball.type], ball, 'player', { crit, angle: Math.atan2(ny, nx), impactSpeed: closing });
  }

  _impactMultiplier(ball) {
    this._refreshRicochet(ball);
    return (1 + this._level('power', ball) * 0.24) * (1 + (ball.fusionLevel || 0) * 0.2)
      * (ball.shotRod === 'bone' ? 1.25 : 1)
      * (effectiveTraitsOf(ball).includes('iron') ? 1.15 + (this.state.upgrades.iron || 1) * 0.2 : 1)
      * (ball.type === 'ghost' ? 0.62 * (ball.branchDamageScale || 1) : 1) * describeRicochet(ball).multiplier * describeCatch(ball).multiplier;
  }

  _areaDamage(x, y, radius, damage, color, source, maxTargets, sourceBall = null, damageCause = 'player', effectMeta = {}) {
    if (['rod', 'fire', 'steam', 'fire_charge'].includes(source)) damage *= this._fireMultiplier();
    this.onEvent({ type: 'pulse', x, y, value: Math.round(damage), color, radius, source });
    const targets = this.state.enemies
      .filter(enemy => enemy.hp > 0 && length(enemy.x - x, enemy.y - y) <= radius)
      .sort((a, b) => length(a.x - x, a.y - y) - length(b.x - x, b.y - y))
      .slice(0, maxTargets);
    const context = effectMeta.buildContext || Combat.createHitContext();
    for (const enemy of targets) if (context.remaining > 0) this._damage(enemy, damage, color, sourceBall, source === 'weather' ? 'environment' : damageCause, { ...effectMeta, buildContext: context, burning: ['rod', 'fire', 'steam', 'fire_charge'].includes(source) || Boolean(sourceBall && this._isBurning(sourceBall)), explosive: ['tnt', 'creeper'].includes(source), angle: Math.atan2(enemy.y - y, enemy.x - x), source });
  }

  _element(ball, damage, effectMeta = {}) {
    const s = this.state;
    const context = effectMeta.buildContext || Combat.createHitContext();
    for (const trait of effectiveTraitsOf(ball)) {
      if (!['storm', 'frost'].includes(trait)) continue;
      const key = `${ball.id}:${trait}`;
      const last = this._elements.get(key) ?? -Infinity;
      if (s.elapsed - last < 0.45 * (s.overchargeTimer > 0 ? 0.55 : 1)) continue;
      this._elements.set(key, s.elapsed);
      const level = s.upgrades[trait] || 1;
      if (trait === 'frost') {
        const radius = 95 + level * 25;
        for (const enemy of s.enemies) {
          if (enemy.hp > 0 && length(enemy.x - ball.x, enemy.y - ball.y) < radius) {
            enemy.slowTimer = Math.max(enemy.slowTimer || 0, 1.5 + level * 0.6);
            enemy.flash = 0.16;
            const bonus = Combat.applyFrost(this, enemy, ball, damage, level, { ...effectMeta, buildContext: context });
            if (bonus > 0) this._damage(enemy, bonus, COLORS.frost, ball, 'player', { noBuildTriggers: true, source: 'frost_shatter', buildContext: context });
          }
        }
        this.onEvent({ type: 'hit', x: ball.x, y: ball.y, value: 0, color: COLORS.frost, target: 'enemy', effectOnly: true, combo: 0, crit: false, burning: this._isBurning(ball), shield: false, kind: 'frost_pulse', material: null, sourceBallId: ball.id, angle: Math.atan2(ball.vy, ball.vx) });
      } else {
        this._lightning(ball, damage, level, { ...effectMeta, buildContext: context });
      }
    }
  }

  _lightning(ball, damage, level, effectMeta = {}) {
    const s = this.state;
    const context = effectMeta.buildContext || Combat.createHitContext();
    let from = { x: ball.x, y: ball.y };
    const used = new Set();
    for (let i = 0; i < 2 + level; i += 1) {
      let target = null;
      let nearest = 150 + level * 20;
      for (const enemy of s.enemies) {
        if (enemy.hp <= 0 || used.has(enemy.id)) continue;
        const distance = length(enemy.x - from.x, enemy.y - from.y);
        if (distance < nearest) { target = enemy; nearest = distance; }
      }
      if (!target) break;
      used.add(target.id);
      const to = { x: target.x, y: target.y };
      const strikeDamage = damage * (0.35 + level * 0.1) * this._lightningMultiplier();
      this.onEvent({ type: 'lightning', x: to.x, y: to.y, from, to, value: strikeDamage, color: COLORS.storm });
      if (context.remaining <= 0) break;
      this._damage(target, strikeDamage, COLORS.storm, ball, 'player', { ...effectMeta, buildContext: context, source: 'lightning' });
      from = to;
    }
  }

  _enemyPair(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = length(dx, dy);
    const reach = a.r + b.r;
    if (d >= reach) return;
    const nx = d > 0.001 ? dx / d : 1;
    const ny = d > 0.001 ? dy / d : 0;
    const overlap = (reach - d + 0.02) * 0.5;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;
    const relative = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (relative < 75) return;
    const source = length(a.vx, a.vy) >= length(b.vx, b.vy) ? a : b;
    const target = source === a ? b : a;
    if ((source.chainLeft || 0) <= 0 || !this._contactReady(`e${a.id}e${b.id}`, 0.3)) return;
    const push = relative * 0.65;
    a.vx -= nx * push;
    a.vy -= ny * push;
    b.vx += nx * push;
    b.vy += ny * push;
    target.chainLeft = source.chainLeft - 1;
    target.sourceBallId = source.sourceBallId;
    source.chainLeft -= 1;
    const originBall = this.state.balls.find(ball => ball.id === source.sourceBallId);
    this._damage(target, (7 + relative * 0.022) * (1 + this._level('power', originBall) * 0.24), '#ffbd69', originBall);
    this._limit(a, 650);
    this._limit(b, 650);
  }

  _contactReady(key, interval) {
    const now = this.state.elapsed;
    const last = this._contacts.get(key) ?? -Infinity;
    if (now - last < interval) return false;
    this._contacts.set(key, now);
    return true;
  }

  _damage(enemy, amount, color, sourceBall = null, cause = 'player', meta = {}) {
    if (enemy.hp <= 0) return;
    amount = Combat.prepareHit(this, enemy, amount, sourceBall, meta);
    const effectDamage = amount;
    const hitInfo = { target: 'enemy', combo: this.state.combo, crit: Boolean(meta.crit), burning: meta.burning ?? Boolean(sourceBall && this._isBurning(sourceBall)), kind: enemy.kind, material: null, sourceBallId: sourceBall?.id ?? null, angle: meta.angle ?? (sourceBall ? Math.atan2(enemy.y - sourceBall.y, enemy.x - sourceBall.x) : 0), explosive: Boolean(meta.explosive), impactSpeed: meta.impactSpeed || 0, ...(meta.source ? { damageSource: meta.source } : {}) };
    if (enemy.kind === 'zombified_piglin' && amount > 0 && cause !== 'environment') this.state.piglinAggro = true;
    if (enemy.shield > 0) {
      const blocked = Math.min(enemy.shield, amount);
      enemy.shield -= blocked;
      amount -= blocked;
      enemy.flash = 0.16;
      this.onEvent({ type: 'hit', x: enemy.x, y: enemy.y, value: Math.round(blocked), color: '#b9a0ff', ...hitInfo, shield: true, shieldRemaining: enemy.shield, shieldBroken: enemy.shield === 0 });
      if (amount <= 0) { Combat.afterHit(this, enemy, effectDamage, sourceBall, meta); return; }
    }
    enemy.hp -= amount;
    enemy.flash = 0.12;
    this.onEvent({ type: 'hit', x: enemy.x, y: enemy.y, value: Math.round(amount), color, ...hitInfo, shield: false, shieldRemaining: enemy.shield || 0 });
    if (enemy.hp > 0) { Combat.afterHit(this, enemy, effectDamage, sourceBall, meta); return; }
    const s = this.state;
    enemy.hp = 0;
    s.kills += 1;
    const boss = BOSS_KINDS.has(enemy.kind);
    const points = boss ? 300 : ['tank', 'shield_zombie', 'enderman', 'blaze'].includes(enemy.kind) ? 30 : enemy.kind === 'runner' ? 14 : 10;
    s.score += Math.round(points * (1 + Math.min(30, s.combo) * 0.025));
    this._dropExperience(enemy.x, enemy.y, boss ? 18 : ['tank', 'enderman', 'blaze'].includes(enemy.kind) ? 3 : ['runner', 'shield_zombie', 'skeleton'].includes(enemy.kind) ? 2 : 1);
    if (boss) {
      if (!s.bossesDefeated.includes(enemy.kind)) s.bossesDefeated.push(enemy.kind);
      this._bossDefeated = this._allBossesDefeated();
      this.onEvent({ type: 'bossDefeat', x: enemy.x, y: enemy.y, kind: enemy.kind });
    }
    this._releaseHeld(enemy.id);
    const drops = boss ? { iron: 3, bone: 3, gunpowder: 3 }
      : enemy.kind === 'slime' ? { slimeBall: enemy.size === 3 ? 2 : 1 }
        : enemy.kind === 'skeleton' ? { bone: 2 }
        : enemy.kind === 'blaze' ? { blazeRod: 2, blazePowder: 3 }
          : enemy.kind === 'enderman' ? { endPearl: s.stage === 'nether' ? 2 : 1 }
            : enemy.kind === 'creeper' ? { gunpowder: 2 }
              : ['shield_zombie', 'trident_drowned'].includes(enemy.kind) ? { iron: 1 }
                : enemy.kind === 'piglin_brute' ? { gold: 2, netheriteScrap: 1 }
                  : enemy.kind === 'zombified_piglin' ? { gold: 1 }
                    : enemy.kind === 'ghast' ? { gunpowder: 3, netheriteScrap: 1 }
                      : enemy.kind === 'magma_cube' ? { quartz: 1, blazePowder: 1 }
                        : enemy.kind === 'vindicator' ? { iron: 2 }
                          : enemy.kind === 'evoker' ? { endPearl: 1, diamond: 1 }
                            : ['witch', 'drowned'].includes(enemy.kind) ? { bone: 1 }
                              : enemy.kind === 'husk' ? { stone: 2 } : {};
    if (Object.keys(drops).length && this.random() < Math.min(0.75, this._level('looting', sourceBall) * 0.25)) for (const id of Object.keys(drops)) drops[id] += 1;
    this._grantMaterials(drops, enemy.x, enemy.y);
    if (this.random() < 0.05) {
      const enchantId = BOOK_IDS[Math.min(BOOK_IDS.length - 1, Math.floor(this.random() * BOOK_IDS.length))];
      s.books[enchantId] = (s.books[enchantId] || 0) + 1;
      this.onEvent({ type: 'dropBook', x: enemy.x, y: enemy.y, enchantId, name: UPGRADES.find(u => u.id === enchantId).name });
    }
    if (['slime', 'magma_cube'].includes(enemy.kind) && enemy.size > 1) {
      for (const side of [-1, 1]) this._spawnEnemy(enemy.kind, { x: enemy.x + side * (enemy.r * 0.65), y: enemy.y, size: enemy.size - 1, vx: side * 110, vy: -40 });
    }
    if (enemy.kind === 'creeper' && !enemy.exploded) {
      enemy.exploded = true;
      this._areaDamage(enemy.x, enemy.y, 130, 50, '#a3e635', 'creeper', 16, sourceBall, cause);
      if (length(enemy.x - CX, enemy.y - CY) < 130 + WORLD.baseRadius) this._hurtBase(15);
    }
    this._event('kill', enemy.x, enemy.y, points, color);
    Combat.onDeath(this, enemy, meta);
    Combat.afterHit(this, enemy, effectDamage, sourceBall, meta);
  }

  _isFreeUpgradeAvailable(id) {
    const s = this.state;
    const spec = UPGRADES.find(upgrade => upgrade.id === id);
    if (!FREE_UPGRADE_IDS.has(id) || !spec) return false;
    if (id === 'stationary_turret') {
      return s.balls.some(ball => this._turretTargetCheck(ball.id).ok);
    }
    if ((s.upgrades[id] || 0) >= spec.maxLevel) return false;
    if (TRAITS.includes(id)) {
      const hasStandalone = s.balls.some(ball => ball.type === id && !(ball.fusionLevel > 0));
      const canSpawn = s.balls.length < MAX_BALLS || s.balls.some(ball => ball.type === 'ghost');
      if (!hasStandalone && !canSpawn) return false;
    }
    return true;
  }

  _checkLevel() {
    const s = this.state;
    if (s.phase !== 'playing' || s.pendingUpgrades <= 0) return false;
    if (s.hp <= 0) { this._end('lost'); return false; }
    if (this._isVictory()) { this._end('won'); return false; }
    const available = UPGRADES.filter(upgrade => !upgrade.fallbackOnly && this._isFreeUpgradeAvailable(upgrade.id));
    if (available.length < 3) available.push(...UPGRADES.filter(upgrade => upgrade.fallbackOnly && this._isFreeUpgradeAvailable(upgrade.id)));
    if (!available.length) {
      s.pendingUpgrades = 0;
      s.choices = [];
      this._offeredUpgrades = [];
      return false;
    }
    const selected = [];
    for (const category of ['rod', 'ball', 'base']) {
      const candidates = available.filter(upgrade => upgrade.category === category);
      if (!candidates.length) continue;
      const chosen = candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))];
      selected.push(chosen.id);
      available.splice(available.indexOf(chosen), 1);
    }
    while (selected.length < 3 && available.length) {
      const index = Math.min(available.length - 1, Math.floor(this.random() * available.length));
      selected.push(available.splice(index, 1)[0].id);
    }
    s.choices = selected;
    s.upgradeTarget = null;
    this._offeredUpgrades = [...selected];
    this.cancelAim();
    s.phase = 'upgrade';
    this._event('level', CX, CY, s.level, '#c4b5fd');
    return true;
  }

  _event(type, x, y, value, color) { this.onEvent({ type, x, y, value, color }); }

  _end(phase) {
    if (this.state.phase === 'won' || this.state.phase === 'lost') return;
    this.cancelAim();
    this.state.phase = phase;
    this.state.choices = [];
    this.state.upgradeTarget = null;
    this.state.pendingUpgrades = 0;
    this._offeredUpgrades = [];
    this._event('end', CX, CY, this.state.score, phase === 'won' ? '#6ee7b7' : '#fb7185');
  }
}
