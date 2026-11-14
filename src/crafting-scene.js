import * as THREE from '../vendor/three.module.js';
import { getCraftingGrid, getMaterialVisual, getRecipeIcon, getRecipeGroup } from './crafting-ui.js';

/** Independent crafting set. Uses the caller's renderer/pipeline, and never
 * disposes borrowed textures or the supplied environment map. */
export function createCraftingScene(textures = {}, environment = null) {
  const scene = new THREE.Scene(); scene.name = 'crafting-workshop';
  scene.background = new THREE.Color('#221c15');
  scene.environment = environment?.isTexture ? environment : environment?.environment || null;
  scene.environmentIntensity = .35;
  scene.userData.assetErrors = [];
  const camera = new THREE.PerspectiveCamera(42, 1, .5, 1000);
  camera.position.set(48, 142, 192); camera.lookAt(0, 22, 0);
  const localTextures = { ...textures }, ownedTextures = new Set(), materials = new Map();
  const loader = typeof document === 'undefined' ? null : new THREE.TextureLoader();
  let disposed = false, recipeKey = '', product = null;

  function texture(name) {
    const key = name.replaceAll('_', '-');
    const supplied = localTextures[key] || localTextures[key.replaceAll('-', '_')];
    if (supplied) return supplied;
    if (!loader) return null;
    const value = loader.load(new URL(`../assets/minecraft/${key}.png`, import.meta.url).href,
      loaded => { if (disposed) loaded.dispose(); }, undefined,
      () => {
        if (disposed) return;
        scene.userData.assetErrors.push(key);
        for (const mat of materials.values()) if (mat.map === value) { mat.map = null; mat.needsUpdate = true; }
      });
    value.magFilter = value.minFilter = THREE.NearestFilter; value.generateMipmaps = false; value.colorSpace = THREE.SRGBColorSpace;
    localTextures[key] = value; ownedTextures.add(value); return value;
  }

  function material(name, color = '#ffffff', options = {}) {
    const key = `${name || 'solid'}:${color}:${JSON.stringify(options)}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ map: name ? texture(name) : null, color, roughness: .86, metalness: 0, ...options }));
    return materials.get(key);
  }
  function box(parent, w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function item(parent, name, color, size, x, y, z, upright = false) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material(name, color, { side: THREE.DoubleSide, alphaTest: .15, metalness: .08 }));
    mesh.position.set(x, y, z); mesh.rotation.x = upright ? -.22 : -Math.PI / 2;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  scene.add(new THREE.HemisphereLight('#c8dcff', '#453725', .9));
  const sun = new THREE.DirectionalLight('#ffe0ad', 1.55); sun.position.set(-95, 190, 120); sun.target.position.set(-15, 26, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -145, right: 145, top: 135, bottom: -135, near: 1, far: 460 });
  sun.shadow.normalBias = .3; sun.shadow.bias = -.0001; scene.add(sun, sun.target);
  const glow = new THREE.PointLight('#ffd391', 9500, 260, 2); glow.position.set(-83, 85, 48); scene.add(glow);
  const fill = new THREE.PointLight('#c0daff', 3000, 250, 2); fill.position.set(95, 85, 40); scene.add(fill);

  const wood = material('wood-planks', '#c5b197'), darkWood = material('wood-planks', '#71604b'), stone = material('stone', '#99958c');
  for (let x = -135; x < 135; x += 30) for (let z = -100; z < 110; z += 30) box(scene, 30, 3, 30, wood, x + 15, -3, z + 15);
  box(scene, 280, 105, 8, darkWood, 0, 48, -100);
  for (const x of [-127, 127]) box(scene, 12, 112, 12, material('oak-log'), x, 51, -91);
  box(scene, 280, 8, 12, material('oak-log'), 0, 102, -93);
  // A shelf and spare blocks communicate a workshop without a merchant.
  box(scene, 80, 4, 24, wood, 64, 58, -85);
  for (const [index, name] of ['iron', 'stone', 'gold'].entries()) box(scene, 17, 15, 17, material(name), 36 + index * 25, 67.5, -84);
  const lightMat = material(null, '#ffd79b', { emissive: '#ffbf65', emissiveIntensity: 1.7 });
  box(scene, 8, 13, 8, lightMat, -104, 69, -86);
  box(scene, 13, 3, 13, material('iron', '#61513a', { metalness: .4 }), -104, 61, -86);

  const table = new THREE.Group(); table.name = 'crafting-table'; table.position.x = -20; scene.add(table);
  const side = material('crafting-side'), top = material('crafting-top');
  box(table, 112, 7, 88, [side, side, top, wood, side, side], 0, 33, 0);
  for (const x of [-45, 45]) for (const z of [-33, 33]) box(table, 9, 30, 9, darkWood, x, 14, z);
  for (const z of [-32, 32]) box(table, 98, 5, 5, wood, 0, 11, z);
  // Inset cells match the nine HTML preview slots; each holds an ingredient stack.
  for (let i = 0; i < 9; i++) {
    const tile = box(table, 22, .4, 22, material('wood-planks', i % 2 ? '#b3956c' : '#d2b88d'), (i % 3 - 1) * 29, 36.75, (Math.floor(i / 3) - 1) * 25);
    tile.name = `crafting-slot:${i}`; tile.castShadow = false;
  }
  box(scene, 34, 5, 39, stone, 65, 32, 0);
  for (const x of [54, 76]) box(scene, 6, 29, 6, darkWood, x, 14, 0);
  // Small wooden arrow between the table and finished-product pedestal.
  box(scene, 17, 1.5, 4, material(null, '#e4c476'), 42, 39, 0);
  const arrowA = box(scene, 9, 1.5, 3, material(null, '#e4c476'), 47, 39, -2.5); arrowA.rotation.y = -.6;
  const arrowB = box(scene, 9, 1.5, 3, material(null, '#e4c476'), 47, 39, 2.5); arrowB.rotation.y = .6;

  const preview = new THREE.Group(); preview.name = 'recipe-preview'; scene.add(preview);
  function clearPreview() {
    const geometries = new Set(); preview.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
    geometries.forEach(geometry => geometry.dispose()); preview.clear(); product = null;
  }
  function setRecipe(recipe) {
    if (disposed) return;
    const key = recipe ? JSON.stringify([recipe.id, recipe.cost, recipe.kind, recipe.texture]) : '';
    if (key === recipeKey) return;
    recipeKey = key; clearPreview(); scene.userData.recipeId = recipe?.id || null;
    if (!recipe) return;
    for (const ingredient of getCraftingGrid(recipe)) {
      const visual = getMaterialVisual(ingredient.material), x = -20 + (ingredient.slot % 3 - 1) * 29, z = (Math.floor(ingredient.slot / 3) - 1) * 25;
      const stack = new THREE.Group(); stack.name = `ingredient:${ingredient.material}`;
      stack.userData.material = ingredient.material; stack.userData.amount = ingredient.amount; stack.userData.slot = ingredient.slot; preview.add(stack);
      const layers = Math.min(3, Math.max(1, Math.ceil(ingredient.amount / 2)));
      for (let layer = 0; layer < layers; layer++) {
        if (visual.shape === 'block') box(stack, 13, 5, 13, material(visual.texture), x + layer * .6, 39.5 + layer * 5.2, z - layer * .6);
        else item(stack, visual.texture, '#ffffff', 18, x + layer * .8, 37.6 + layer * .65, z - layer * .7);
      }
    }
    product = new THREE.Group(); product.name = 'crafted-product'; product.position.set(65, 45, 0); product.userData.recipeId = recipe.id; preview.add(product);
    if (getRecipeGroup(recipe) === 'blocks') {
      const icon = getRecipeIcon(recipe);
      const slime = recipe.id === 'slime_block' || recipe.ballType === 'slime';
      const mats = recipe.id === 'tnt' ? [material('tnt-side'), material('tnt-side'), material('tnt-top'), material('tnt-bottom'), material('tnt-side'), material('tnt-side')]
        : slime ? material(icon, '#ffffff', { transparent: true, opacity: 1, depthWrite: false, roughness: .32 }) : material(icon);
      if (slime) box(product, 11, 11, 11, material(null, '#81b65a', { roughness: .52 }), 0, 0, 0);
      box(product, 18, 18, 18, mats, 0, 0, 0);
    } else item(product, getRecipeIcon(recipe), '#ffffff', 29, 0, 0, 0, true);
  }

  function resize(width, height) {
    if (disposed) return;
    const w = Math.max(1, Number.isFinite(width) ? width : 1), h = Math.max(1, Number.isFinite(height) ? height : 1);
    camera.aspect = w / h; camera.fov = camera.aspect < 1.2 ? 60 : 42;
    // The list occupies the right side, details occupy the lower left. Narrow
    // screens use a centered upper stage above the stacked HTML controls.
    camera.setViewOffset(w, h, w * (camera.aspect >= 1.2 ? .20 : .04), h * .13, w, h);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
  function update(time = 0) {
    if (disposed || !product) return;
    const t = Number.isFinite(time) ? time : 0;
    product.position.y = 45 + Math.sin(t * 1.6) * .8;
    product.rotation.y = Math.sin(t * .7) * .2;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set(); scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.isLight && object.shadow) object.shadow.dispose();
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(mat => mat.dispose()); ownedTextures.forEach(map => map.dispose());
    scene.environment = null; scene.clear(); product = null;
  }
  resize(1000, 720);
  return { scene, camera, resize, update, setRecipe, dispose };
}
