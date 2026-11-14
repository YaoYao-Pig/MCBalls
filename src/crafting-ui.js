import { RECIPES } from './core.js';

const FILTERS = [['all', '全部'], ['tools', '工具'], ['blocks', '方块'], ['facilities', '设施'], ['items', '道具'], ['allies', '友军']];
const MATERIALS = {
  wood: ['木材', 'oak-log', '#a47d48', 'block'], stone: ['石料', 'stone', '#92938a', 'block'],
  iron: ['铁锭', 'iron-ingot', '#d8d6cb'], diamond: ['钻石', 'diamond-item', '#56d9d3'],
  obsidian: ['黑曜石', 'obsidian', '#493c58', 'block'], endPearl: ['末影珍珠', 'ender-pearl', '#34a996'],
  blazeRod: ['烈焰棒', 'blaze-rod', '#efbb42'], blazePowder: ['烈焰粉', 'blaze-powder', '#f8ba39'],
  bone: ['骨头', 'bone', '#e0dac6'], gunpowder: ['火药', 'gunpowder', '#77736f'],
  gold: ['金锭', 'gold-ingot', '#f2d16b'], quartz: ['下界石英', 'quartz', '#e6d6ca'],
  netheriteScrap: ['下界合金碎片', 'netherite-scrap', '#71544a'], copper: ['铜锭', 'copper-ingot', '#d78a60'],
  redstone: ['红石粉', 'redstone-dust', '#d95045'], lapis: ['青金石', 'lapis-lazuli', '#5287cf'],
  slimeBall: ['黏液球', 'slime-ball', '#93c56d'],
};
const ICONS = {
  bone_rod: 'bone', end_rod: 'end-rod', blaze_rod: 'blaze-rod',
  tnt: 'tnt-side', potion: 'apple', repair: 'beacon', iron_block: 'iron', redstone_block: 'redstone',
  frost_block: 'ice', gold_block: 'gold', golden_block: 'gold', obsidian_block: 'obsidian',
  slime_block: 'slime-block',
  iron_golem: 'iron-ingot', snow_golem: 'snow-block', snowball: 'snowball', fire_charge: 'fire-charge',
  ender_pearl: 'ender-pearl', redstone_boost: 'redstone', enchanting_table: 'enchanting-table-top',
  anvil: 'anvil-top', lightning_rod: 'lightning-rod',
  wood_pickaxe: 'wooden-pickaxe', wooden_pickaxe: 'wooden-pickaxe', stone_pickaxe: 'stone-pickaxe',
  iron_pickaxe: 'iron-pickaxe', gold_pickaxe: 'golden-pickaxe', golden_pickaxe: 'golden-pickaxe',
  diamond_pickaxe: 'diamond-pickaxe', netherite_pickaxe: 'netherite-pickaxe',
};
const normalize = name => String(name).replaceAll('_', '-');
const asset = name => new URL(`../assets/minecraft/${normalize(name)}.png`, import.meta.url).href;

export function getMaterialVisual(id) {
  const value = MATERIALS[id];
  return value ? { name: value[0], texture: value[1], color: value[2], shape: value[3] || 'item' }
    : { name: id, texture: normalize(id.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)), color: '#b1a58b', shape: 'item' };
}

export function getRecipeIcon(recipe) {
  if (!recipe) return 'crafting-top';
  return normalize(recipe.texture || recipe.itemTexture || ICONS[recipe.id] || (recipe.kind === 'pickaxe' || recipe.id.includes('pickaxe') ? recipe.id : 'crafting-top'));
}

export function getRecipeGroup(recipe) {
  if (recipe.id === 'lightning_rod') return 'facilities';
  if (['rod', 'tool', 'pickaxe', 'weapon'].includes(recipe.kind) || /pickaxe/.test(recipe.id)) return 'tools';
  if (['ball', 'block'].includes(recipe.kind)) return 'blocks';
  if (['station', 'base', 'structure', 'defense', 'facility'].includes(recipe.kind)) return 'facilities';
  if (recipe.kind === 'ally') return 'allies';
  return 'items';
}

/** One stack per ingredient. This previews the recipe cost, not a separate
 * manually arranged recipe system; crafting still uses Game's exact cost. */
export function getCraftingGrid(recipe) {
  const ingredients = Object.entries(recipe?.cost || {}).filter(([, amount]) => amount > 0);
  const layouts = { 1: [4], 2: [3, 5], 3: [1, 3, 5], 4: [0, 2, 6, 8] };
  const positions = layouts[ingredients.length] || [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return ingredients.slice(0, 9).map(([material, amount], index) => ({ slot: positions[index], material, amount }));
}

function ownedLabel(recipe, state) {
  if (recipe.kind === 'rod') return state.ownedRods?.includes(recipe.rodId) ? '已拥有' : '未拥有';
  if (recipe.kind === 'station') return state.stations?.[recipe.station] ? '已建造' : '未建造';
  if (recipe.kind === 'ball') return `场上 ${(state.balls || []).filter(ball => ball.type === recipe.ballType).length}`;
  if (recipe.kind === 'ally') return `在场 ${(state.allies || []).filter(ally => ally.kind === recipe.id && ally.hp > 0).length}`;
  if (recipe.kind === 'base') return `强化 ${state.upgrades?.[recipe.id] || 0} 次`;
  if (recipe.kind === 'pickaxe' || recipe.kind === 'tool') {
    const id = recipe.pickaxeId || recipe.toolId || recipe.id;
    const owned = state.ownedPickaxes || state.ownedTools || [];
    const tiers = ['hand', 'wood', 'stone', 'iron', 'diamond', 'netherite'];
    const reached = recipe.kind === 'pickaxe' && tiers.includes(id) && tiers.indexOf(state.pickaxe || 'hand') >= tiers.indexOf(id);
    return reached || (Array.isArray(owned) ? owned.includes(id) : !!owned[id]) ? '已拥有' : '未拥有';
  }
  if (recipe.id === 'lightning_rod') return `库存 ${state.items?.lightning_rod || 0} · 已建 ${(state.structures || []).filter(item => item.kind === 'lightning_rod').length}`;
  return `库存 ${Math.max(0, state.items?.[recipe.itemId || recipe.id] || 0)}`;
}

function makeImage(name) {
  const image = document.createElement('img'); image.src = asset(name); image.alt = '';
  image.addEventListener('error', () => {
    if (image.dataset.fallback) return;
    image.dataset.fallback = 'true'; image.src = asset('crafting-top');
  });
  return image;
}

/** Selection and preview never spend resources. Only the explicit craft button
 * calls Game.craft(), which validates costs and prerequisites atomically. */
export class CraftingPanel {
  constructor(game, { notify = () => {}, onAction = () => {}, onSelect = () => {} } = {}) {
    this.game = game; this.notify = notify; this.onAction = onAction; this.onSelect = onSelect;
    this.filter = 'all'; this.selectedId = null; this.key = ''; this.lastSentId = null;
    this.elements = Object.fromEntries(['crafting-filters', 'crafting-recipes', 'crafting-grid', 'crafting-product-icon', 'crafting-product-name', 'crafting-description', 'crafting-costs', 'crafting-owned', 'crafting-reason', 'crafting-action'].map(id => {
      const element = document.getElementById(id);
      if (!element) throw new Error(`CraftingPanel requires #${id}`);
      return [id, element];
    }));
    const filters = this.elements['crafting-filters']; filters.replaceChildren();
    for (const [id, name] of FILTERS) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'crafting-filter';
      button.dataset.craftFilter = id; button.textContent = name;
      button.addEventListener('click', () => { this.filter = id; this.refresh(true); }); filters.append(button);
    }
    this.elements['crafting-action'].addEventListener('click', () => this.craft());
    this.elements['crafting-product-icon'].addEventListener('error', event => {
      const image = event.currentTarget;
      if (!image.dataset.fallback) { image.dataset.fallback = 'true'; image.src = asset('crafting-top'); }
    });
  }

  show() { this.lastSentId = null; this.refresh(true); }

  refresh(force = false) {
    const state = this.game.state;
    const recipes = RECIPES.filter(recipe => this.filter === 'all' || getRecipeGroup(recipe) === this.filter);
    if (!recipes.some(recipe => recipe.id === this.selectedId)) this.selectedId = recipes[0]?.id || null;
    const availability = recipes.map(recipe => ({ recipe, check: this.game.canCraft(recipe.id), owned: ownedLabel(recipe, state) }));
    const key = JSON.stringify([this.filter, this.selectedId, state.materials, availability.map(row => [row.recipe.id, row.check.ok, row.check.reason, row.owned])]);
    if (!force && key === this.key) return;
    this.key = key;
    for (const button of this.elements['crafting-filters'].querySelectorAll('button')) {
      const active = button.dataset.craftFilter === this.filter;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    }
    const list = this.elements['crafting-recipes'], scrollTop = list.scrollTop; list.replaceChildren();
    for (const { recipe, check, owned } of availability) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.recipeId = recipe.id;
      button.className = `crafting-recipe${recipe.id === this.selectedId ? ' selected' : ''}${check.ok ? '' : ' unavailable'}`;
      button.setAttribute('aria-pressed', String(recipe.id === this.selectedId));
      button.title = check.ok ? recipe.description : check.reason;
      button.append(makeImage(getRecipeIcon(recipe)));
      const body = document.createElement('span'), name = document.createElement('b'), cost = document.createElement('small'), count = document.createElement('small');
      name.textContent = recipe.name; cost.className = 'crafting-recipe-cost';
      cost.textContent = Object.entries(recipe.cost || {}).map(([id, amount]) => `${getMaterialVisual(id).name} ${Math.max(0, state.materials[id] || 0)}/${amount}`).join(' · ');
      count.className = 'crafting-recipe-owned'; count.textContent = owned;
      body.append(name, cost, count); button.append(body);
      button.addEventListener('click', () => { this.selectedId = recipe.id; this.refresh(true); }); list.append(button);
    }
    if (!recipes.length) { const empty = document.createElement('p'); empty.className = 'crafting-empty'; empty.textContent = '这一分类暂时没有配方。'; list.append(empty); }
    list.scrollTop = scrollTop;
    const selected = availability.find(row => row.recipe.id === this.selectedId);
    this.renderPreview(selected);
    if (this.lastSentId !== this.selectedId) { this.lastSentId = this.selectedId; this.onSelect(selected?.recipe || null); }
  }

  renderPreview(selected) {
    const get = id => this.elements[id], recipe = selected?.recipe, materials = this.game.state.materials;
    const product = get('crafting-product-icon'); delete product.dataset.fallback;
    product.src = asset(getRecipeIcon(recipe)); product.alt = recipe?.name || '';
    get('crafting-product-name').textContent = recipe?.name || '选择一个配方';
    get('crafting-description').textContent = recipe?.description || '从右侧选择要制作的物品，材料会出现在工作台上。';
    get('crafting-owned').textContent = selected?.owned || '';
    const grid = get('crafting-grid'); grid.replaceChildren(); const cells = getCraftingGrid(recipe);
    for (let index = 0; index < 9; index++) {
      const cell = document.createElement('div'), ingredient = cells.find(item => item.slot === index);
      cell.className = `crafting-cell ${ingredient ? 'filled' : 'empty'}`;
      if (ingredient) {
        const visual = getMaterialVisual(ingredient.material), have = Math.max(0, materials[ingredient.material] || 0);
        cell.dataset.material = ingredient.material; cell.classList.toggle('missing', have < ingredient.amount);
        cell.title = `${visual.name}：需要 ${ingredient.amount}，拥有 ${have}`;
        const count = document.createElement('small'); count.textContent = `×${ingredient.amount}`;
        cell.append(makeImage(visual.texture), count);
      }
      grid.append(cell);
    }
    const costs = get('crafting-costs'); costs.replaceChildren();
    for (const [id, amount] of Object.entries(recipe?.cost || {})) {
      const visual = getMaterialVisual(id), have = Math.max(0, materials[id] || 0), row = document.createElement('span');
      row.className = `crafting-cost${have < amount ? ' missing' : ''}`; row.dataset.material = id;
      row.append(makeImage(visual.texture)); const label = document.createElement('span'); label.textContent = `${visual.name} ${have} / ${amount}`; row.append(label); costs.append(row);
    }
    get('crafting-action').textContent = '合成'; get('crafting-action').disabled = !selected?.check.ok;
    get('crafting-reason').textContent = selected ? (selected.check.ok ? '材料齐全，点击合成。' : selected.check.reason) : '请选择一个配方。';
  }

  craft() {
    const recipe = RECIPES.find(item => item.id === this.selectedId);
    if (!recipe) return;
    const check = this.game.canCraft(recipe.id);
    if (!check.ok || !this.game.craft(recipe.id)) { this.notify(check.reason || '暂时无法合成'); this.refresh(true); return; }
    this.notify(`已合成：${recipe.name}`); this.key = ''; this.onAction(recipe); this.refresh(true);
  }
}
