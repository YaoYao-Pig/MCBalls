import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import * as THREE from '../vendor/three.module.js';
import { Game, RECIPES } from '../src/core.js';
import { CraftingPanel, getRecipeGroup, getCraftingGrid, getMaterialVisual, getRecipeIcon } from '../src/crafting-ui.js';
import { createCraftingScene } from '../src/crafting-scene.js';

// Exercise the shipped markup while keeping scripts, styles, images and WebGL
// disabled. This catches missing/renamed production IDs as well as event wiring.
const markup = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function fixture(t) {
  const window = new Window({ settings: { enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true, enableImageFileLoading: false, enableCSSFileLoading: false } });
  window.document.write(markup);
  const previous = globalThis.document; globalThis.document = window.document;
  t.after(async () => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; await window.happyDOM.close(); });
  const game = new Game({ random: () => .55 }); game.start(); game.togglePause();
  for (const recipe of RECIPES) for (const material of Object.keys(recipe.cost || {})) game.state.materials[material] = 100;
  const actions = [], selections = [], notices = [];
  const panel = new CraftingPanel(game, { notify: message => notices.push(message), onSelect: recipe => selections.push(recipe?.id || null), onAction: recipe => { actions.push(recipe.id); panel.refresh(); } });
  const get = id => window.document.getElementById(id);
  const choose = id => {
    const button = get('crafting-recipes').querySelector(`[data-recipe-id="${id}"]`);
    assert.ok(button, `recipe ${id} must be visible`); button.click();
  };
  const filter = id => get('crafting-filters').querySelector(`[data-craft-filter="${id}"]`).click();
  panel.show();
  return { window, game, panel, get, choose, filter, actions, selections, notices };
}

test('crafting lists recipes with a single selection and sends the initial 3D preview', t => {
  const { panel, get, selections } = fixture(t);
  for (const id of ['crafting-grid', 'crafting-filters', 'crafting-recipes', 'crafting-action', 'crafting-close']) assert.ok(get('crafting-panel').contains(get(id)), `#${id} belongs to the actual crafting panel`);
  assert.equal(get('crafting-recipes').querySelectorAll('[data-recipe-id]').length, RECIPES.length);
  assert.equal(get('crafting-filters').querySelectorAll('button').length, 6);
  assert.equal(get('crafting-recipes').querySelectorAll('.selected').length, 1);
  assert.equal(selections[0], panel.selectedId);
  assert.equal(get('crafting-grid').children.length, 9);
  assert.equal(get('crafting-product-name').textContent, RECIPES[0].name);
});

test('selecting a recipe updates material stacks and output without spending any inventory', t => {
  const { game, panel, get, choose, selections, actions } = fixture(t);
  const recipe = RECIPES.find(item => item.id === 'enchanting_table');
  const before = structuredClone(game.state);
  choose(recipe.id);
  assert.deepEqual(game.state, before);
  assert.equal(actions.length, 0);
  assert.equal(selections.at(-1), recipe.id);
  assert.equal(get('crafting-product-name').textContent, recipe.name);
  assert.equal(get('crafting-description').textContent, recipe.description);
  for (const ingredient of getCraftingGrid(recipe)) {
    const cell = get('crafting-grid').children[ingredient.slot];
    assert.equal(cell.dataset.material, ingredient.material);
    assert.equal(cell.querySelector('small').textContent, `×${ingredient.amount}`);
  }
  const calls = selections.length; panel.refresh();
  assert.equal(selections.length, calls, 'unchanged inventory does not rebuild the scene');
});

test('unavailable recipes remain selectable but prerequisite failures disable the craft action', t => {
  const { game, get, choose, actions } = fixture(t);
  const before = structuredClone(game.state);
  choose('end_rod');
  assert.equal(get('crafting-recipes').querySelector('[data-recipe-id="end_rod"]').disabled, false);
  assert.equal(get('crafting-action').disabled, true);
  assert.match(get('crafting-reason').textContent, /需要/);
  get('crafting-action').click();
  assert.deepEqual(game.state, before);
  assert.equal(actions.length, 0);
});

test('craft button consumes exactly the recipe materials, creates output and preserves selection', t => {
  const { game, panel, get, choose, actions } = fixture(t);
  const recipe = RECIPES.find(item => item.id === 'potion');
  choose(recipe.id);
  const before = structuredClone(game.state.materials), xp = game.state.xp;
  get('crafting-action').click();
  for (const [material, count] of Object.entries(before)) assert.equal(game.state.materials[material], count - (recipe.cost[material] || 0));
  assert.equal(game.state.items.potion, 1);
  assert.equal(game.state.xp, xp);
  assert.equal(panel.selectedId, recipe.id);
  assert.equal(get('crafting-recipes').querySelector('.selected').dataset.recipeId, recipe.id);
  assert.match(get('crafting-owned').textContent, /1/);
  assert.deepEqual(actions, ['potion']);
  panel.refresh(true); assert.equal(panel.selectedId, recipe.id);
});

test('last affordable craft disables the action and repeated clicks never create negative materials', t => {
  const { game, panel, get, choose, actions } = fixture(t);
  const recipe = RECIPES.find(item => item.id === 'potion');
  for (const material of Object.keys(game.state.materials)) game.state.materials[material] = recipe.cost[material] || 0;
  panel.refresh(); choose(recipe.id);
  assert.equal(get('crafting-action').disabled, false);
  get('crafting-action').click();
  assert.equal(get('crafting-action').disabled, true);
  assert.ok([...get('crafting-costs').children].every(row => row.classList.contains('missing')));
  get('crafting-action').click(); get('crafting-action').click();
  assert.equal(game.state.items.potion, 1);
  assert.equal(actions.length, 1);
  assert.ok(Object.values(game.state.materials).every(value => value >= 0));
});

test('costs are revalidated at click time if inventory changes after the enabled button was drawn', t => {
  const { game, get, choose, actions, notices } = fixture(t);
  choose('potion');
  assert.equal(get('crafting-action').disabled, false);
  game.state.materials.bone = 0;
  const before = structuredClone(game.state.materials);
  get('crafting-action').click();
  assert.deepEqual(game.state.materials, before);
  assert.equal(game.state.items.potion, 0);
  assert.equal(actions.length, 0);
  assert.match(notices.at(-1), /材料不足/);
  assert.equal(get('crafting-action').disabled, true);
});

test('filters show the correct groups and preserve an existing valid selection across refreshes', t => {
  const { game, panel, get, choose, filter } = fixture(t);
  choose('iron_block'); filter('blocks');
  assert.equal(panel.selectedId, 'iron_block');
  for (const group of ['tools', 'blocks', 'facilities', 'items', 'allies']) {
    filter(group);
    const ids = [...get('crafting-recipes').querySelectorAll('[data-recipe-id]')].map(button => button.dataset.recipeId);
    assert.deepEqual(ids, RECIPES.filter(recipe => getRecipeGroup(recipe) === group).map(recipe => recipe.id));
    assert.equal(get('crafting-filters').querySelector('.active').dataset.craftFilter, group);
  }
  filter('blocks'); choose('iron_block'); game.state.materials.iron += 2; panel.refresh();
  assert.equal(panel.selectedId, 'iron_block');
  filter('all'); assert.equal(panel.selectedId, 'iron_block');
});

test('station crafting unlocks the workbench and disables duplicate construction', t => {
  const { game, get, choose } = fixture(t);
  assert.equal(game.state.stations.anvil, false);
  choose('anvil'); get('crafting-action').click();
  assert.equal(game.state.stations.anvil, true);
  assert.equal(get('crafting-owned').textContent, '已建造');
  assert.equal(get('crafting-action').disabled, true);
  assert.match(get('crafting-reason').textContent, /已经/);
  const before = structuredClone(game.state.materials); get('crafting-action').click();
  assert.deepEqual(game.state.materials, before);
});

test('crafting a prerequisite enables the next tool without resetting the selected recipe', t => {
  const { game, panel, get, choose } = fixture(t);
  choose('end_rod'); assert.equal(get('crafting-action').disabled, true);
  choose('bone_rod'); get('crafting-action').click();
  assert.equal(panel.selectedId, 'bone_rod'); assert.equal(get('crafting-owned').textContent, '已拥有');
  choose('end_rod'); assert.equal(get('crafting-action').disabled, false);
  get('crafting-action').click();
  assert.ok(game.state.ownedRods.includes('end'));
  assert.equal(panel.selectedId, 'end_rod');
});

test('pickaxes show progression ownership and lightning rods stay in the facilities filter', t => {
  const { game, panel, get, choose, filter } = fixture(t);
  filter('tools'); choose('stone_pickaxe'); assert.equal(get('crafting-action').disabled, true);
  choose('wood_pickaxe'); get('crafting-action').click();
  assert.equal(game.state.pickaxe, 'wood'); assert.equal(get('crafting-owned').textContent, '已拥有');
  choose('stone_pickaxe'); assert.equal(get('crafting-action').disabled, false); get('crafting-action').click();
  assert.equal(game.state.pickaxe, 'stone');
  choose('wood_pickaxe'); assert.equal(get('crafting-owned').textContent, '已拥有');
  filter('facilities'); choose('lightning_rod'); get('crafting-action').click();
  assert.equal(game.state.items.lightning_rod, 1); assert.match(get('crafting-owned').textContent, /库存 1/);
  assert.equal(panel.filter, 'facilities');
});

test('terminal and upgrade phases disable crafting without touching resources', t => {
  const { game, panel, get, choose } = fixture(t);
  choose('potion');
  for (const phase of ['upgrade', 'won', 'lost', 'ready']) {
    game.state.phase = phase; panel.refresh();
    assert.equal(get('crafting-action').disabled, true);
    const before = structuredClone(game.state.materials); get('crafting-action').click();
    assert.deepEqual(game.state.materials, before);
  }
});

test('3D crafting preview replaces ingredient geometry and disposes only scene-owned resources', () => {
  const texture = new THREE.Texture(), environment = new THREE.Texture();
  let borrowedDisposals = 0, environmentDisposals = 0;
  texture.addEventListener('dispose', () => borrowedDisposals++); environment.addEventListener('dispose', () => environmentDisposals++);
  const workshop = createCraftingScene({ 'wood-planks': texture, 'crafting-top': texture, 'iron-ingot': texture }, environment);
  const recipe = RECIPES.find(item => item.id === 'iron_block'); workshop.setRecipe(recipe);
  const preview = workshop.scene.getObjectByName('recipe-preview');
  assert.equal(workshop.scene.userData.recipeId, recipe.id);
  assert.equal(preview.children.filter(child => child.name.startsWith('ingredient:')).length, Object.keys(recipe.cost).length);
  assert.equal(preview.getObjectByName('crafted-product').children[0].geometry.type, 'BoxGeometry');
  let geometryDisposals = 0; preview.traverse(object => object.geometry?.addEventListener('dispose', () => geometryDisposals++));
  workshop.setRecipe(RECIPES.find(item => item.id === 'potion'));
  assert.ok(geometryDisposals > 0);
  for (const [w, h] of [[1000, 720], [390, 600], [0, 0]]) {
    workshop.resize(w, h); workshop.update(2);
    assert.ok(workshop.camera.projectionMatrix.elements.every(Number.isFinite));
  }
  workshop.dispose(); workshop.dispose();
  assert.equal(workshop.scene.children.length, 0);
  assert.equal(borrowedDisposals, 0); assert.equal(environmentDisposals, 0);
  texture.dispose(); environment.dispose();
});

test('slime crafting uses the inventory ingredient and transparent block texture, never the mob atlas', () => {
  const ingredient = getMaterialVisual('slimeBall');
  assert.equal(ingredient.name, '黏液球'); assert.equal(ingredient.texture, 'slime-ball'); assert.equal(ingredient.shape, 'item');
  const recipe = { id: 'slime_block', kind: 'ball', ballType: 'slime', cost: { slimeBall: 4 } };
  assert.equal(getRecipeGroup(recipe), 'blocks'); assert.equal(getRecipeIcon(recipe), 'slime-block');
  const blockTexture = new THREE.Texture(), itemTexture = new THREE.Texture(); let borrowedDisposals = 0;
  blockTexture.addEventListener('dispose', () => borrowedDisposals++); itemTexture.addEventListener('dispose', () => borrowedDisposals++);
  const workshop = createCraftingScene({ 'slime-block': blockTexture, 'slime-ball': itemTexture }); workshop.setRecipe(recipe);
  const product = workshop.scene.getObjectByName('crafted-product'), ingredientGroup = workshop.scene.getObjectByName('ingredient:slimeBall');
  const shell = product.children.find(mesh => mesh.material.map === blockTexture), inner = product.children.find(mesh => !mesh.material.map);
  assert.ok(shell); assert.ok(inner); assert.equal(shell.material.transparent, true); assert.equal(shell.material.opacity, 1); assert.equal(shell.material.depthWrite, false);
  assert.ok(shell.geometry.parameters.width > inner.geometry.parameters.width); assert.equal(inner.material.transparent, false);
  assert.ok(ingredientGroup.children.every(mesh => mesh.material.map === itemTexture));
  workshop.dispose(); assert.equal(borrowedDisposals, 0); blockTexture.dispose(); itemTexture.dispose();
});

test('the real slime recipe shows named material costs and crafts a persistent block', t => {
  const { game, get, choose, filter } = fixture(t);const recipe=RECIPES.find(item=>item.id==='slime_block');assert.ok(recipe);
  filter('blocks');choose(recipe.id);assert.match(get('crafting-costs').textContent,/黏液球/);assert.match(get('crafting-product-icon').src,/slime-block\.png$/);
  const before={...game.state.materials};get('crafting-action').click();
  for(const [id,amount]of Object.entries(recipe.cost))assert.equal(game.state.materials[id],before[id]-amount);
  const output=game.state.balls.find(ball=>ball.type==='slime');assert.ok(output);assert.equal(output.life,undefined);assert.match(get('crafting-owned').textContent,/场上 1/);
});
