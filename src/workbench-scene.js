import * as THREE from '../vendor/three.module.js';
import { createMobModel } from './minecraft-models.js';

/** Independent workbench scene. The caller owns the renderer/postprocessing and
 * any supplied textures/environment; dispose() releases only this scene's work. */
export function createWorkbenchScene(kind, textures = {}, environment = null) {
  if (kind !== 'enchantingTable' && kind !== 'anvil') {
    throw new TypeError(`Unknown workbench kind: ${kind}`);
  }
  const enchanting = kind === 'enchantingTable';
  const scene = new THREE.Scene();
  scene.name = `workbench:${kind}`;
  scene.background = new THREE.Color(enchanting ? '#161c2b' : '#242018');
  scene.environment = environment?.isTexture ? environment : environment?.environment || null;
  scene.environmentIntensity = .35;
  scene.userData.assetErrors = [];
  scene.userData.workbenchKind = kind;
  const camera = new THREE.PerspectiveCamera(42, 1, .5, 900);
  camera.position.set(0, 67, 180);
  camera.lookAt(0, 24, 4);

  let disposed = false;
  const localTextures = { ...textures };
  const ownedTextures = new Set();
  const materials = new Map();
  const loader = new THREE.TextureLoader();
  function texture(name) {
    let value = localTextures[name] || localTextures[name.replaceAll('-', '_')];
    if (!value) {
      const url = new URL(`../assets/minecraft/${name}.png`, import.meta.url).href;
      value = loader.load(url, loaded => {
        if (disposed) loaded.dispose();
      }, undefined, () => {
        if (!disposed) scene.userData.assetErrors.push(name);
      });
      value.magFilter = value.minFilter = THREE.NearestFilter;
      value.generateMipmaps = false;
      value.colorSpace = THREE.SRGBColorSpace;
      ownedTextures.add(value);
    }
    localTextures[name] = value;
    localTextures[name.replaceAll('-', '_')] = value;
    return value;
  }
  function material(name, options = {}) {
    const key = `${name || 'solid'}:${JSON.stringify(options)}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({
        map: name ? texture(name) : null,
        color: 0xffffff, roughness: .85, metalness: 0, ...options,
      }));
    }
    return materials.get(key);
  }
  // UV rectangles use the top-left PNG origin. BoxGeometry's material order is
  // +X, -X, +Y, -Y, +Z, -Z, matching the supplied face-material arrays.
  function box(w, h, d, mat, x, y, z, parent = scene, faceRects = null, atlas = [16, 16]) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    if (faceRects) {
      const uv = geometry.attributes.uv;
      for (let face = 0; face < 6; face++) {
        const [u, v, sw, sh] = faceRects[face] || [0, 0, atlas[0], atlas[1]];
        for (let corner = 0; corner < 4; corner++) {
          const index = face * 4 + corner;
          uv.setXY(index, (u + uv.getX(index) * sw) / atlas[0], 1 - (v + (1 - uv.getY(index)) * sh) / atlas[1]);
        }
      }
    }
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  scene.add(new THREE.HemisphereLight('#b6d5ff', '#443d2d', .9));
  const sun = new THREE.DirectionalLight('#ffd49a', 1.45);
  sun.position.set(-130, 185, 140);
  sun.target.position.set(0, 25, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -155, right: 155, top: 145, bottom: -130, near: 1, far: 460 });
  sun.shadow.normalBias = .25;
  sun.shadow.bias = -.00012;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const key = new THREE.PointLight('#ffd79f', 16000, 300, 2);
  key.position.set(-65, 95, 85);
  const fill = new THREE.PointLight('#adc9ec', 4200, 230, 2);
  fill.position.set(75, 65, 75);
  scene.add(key, fill);

  const wood = material('wood-planks', { color: '#c6b39a', roughness: .9 });
  const darkWood = material('wood-planks', { color: '#756553' });
  // Small floor tiles preserve the texture's pixel scale without cloning an
  // incompletely loaded texture or stretching one plank across the whole room.
  for (let x = -108; x < 108; x += 36) {
    for (let z = -86; z < 94; z += 36) box(36, 4, 36, wood, x + 18, -3, z + 18);
  }
  box(230, 104, 7, darkWood, 0, 49, -88);
  box(230, 8, 14, material('oak-log'), 0, 101, -82);
  for (const side of [-1, 1]) {
    box(12, 108, 12, material('oak-log'), side * 105, 50, -80);
    const glow = material(null, { color: '#ffdc98', emissive: '#ffb957', emissiveIntensity: 1.8, roughness: .6 });
    const lamp = box(7, 11, 7, glow, side * 89, 76, -71);
    lamp.castShadow = false;
    box(13, 3, 13, material('iron', { color: '#635449', metalness: .3, roughness: .65 }), side * 89, 69, -71);
  }

  const merchantKind = enchanting ? 'librarian' : 'toolsmith';
  for (const name of ['villager', 'villager-plains', merchantKind]) texture(name);
  const merchant = createMobModel(merchantKind, localTextures);
  merchant.name = `merchant:${merchantKind}`;
  merchant.position.set(0, 0, -34);
  scene.add(merchant);

  const workbench = new THREE.Group();
  workbench.name = `station:${kind}`;
  workbench.position.set(0, 0, 23);
  scene.add(workbench);
  let book = null;
  let pageTurn = null;
  const motes = [];

  if (enchanting) {
    const side = material('enchanting-table-side', { roughness: .65 });
    const top = material('enchanting-table-top', { roughness: .68 });
    const bottom = material('enchanting-table-bottom', { roughness: .5 });
    const sideUV = [0, 4, 16, 12];
    // Vanilla table: a 16 x 12 x 16 block. The PNG's top four side rows are
    // unused and must not be stretched onto the model.
    box(42, 31.5, 42, [side, side, top, bottom, side, side], 0, 15.75, 0, workbench,
      [sideUV, sideUV, null, null, sideUV, sideUV]);

    book = new THREE.Group();
    book.name = 'floating-open-book';
    book.position.set(0, 43, 0);
    book.rotation.x = .2;
    workbench.add(book);
    const bookMat = material('enchanting-book', { roughness: .9 });
    const coverRects = [0, 0, 6, 10];
    const pageRects = [1, 11, 5, 8];
    for (const direction of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.rotation.z = direction * .19;
      book.add(leaf);
      const coverUV = direction < 0 ? coverRects : [16, 0, 6, 10];
      box(16.5, .9, 25, bookMat, direction * 8.25, 0, 0, leaf, Array(6).fill(coverUV), [64, 32]);
      const pageUV = direction < 0 ? pageRects : [13, 11, 5, 8];
      box(14.5, 1.8, 21, bookMat, direction * 7.6, 1.25, 0, leaf, Array(6).fill(pageUV), [64, 32]);
    }
    box(2, 1, 25, bookMat, 0, -.1, 0, book, Array(6).fill([12, 0, 2, 10]), [64, 32]);
    pageTurn = new THREE.Group();
    pageTurn.position.y = 2.4;
    book.add(pageTurn);
    const page = box(14, .08, 20, bookMat, 7, 0, 0, pageTurn, Array(6).fill([25, 11, 5, 8]), [64, 32]);
    page.castShadow = false;
    const magic = new THREE.PointLight('#9e9aff', 900, 100, 2);
    magic.position.set(0, 45, 23);
    scene.add(magic);

    const shelves = material('bookshelf');
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        box(33, 30, 18, [wood, wood, wood, wood, shelves, wood], side * 68, 15 + row * 30, -66);
      }
      box(40, 4, 23, wood, side * 68, 63, -66);
    }
    const rune = material(null, { color: '#b9c8ff', emissive: '#879bff', emissiveIntensity: 1.5 });
    for (let i = 0; i < 9; i++) {
      const mote = box(1.3, 2.1, .8, rune, 0, 0, 0);
      mote.castShadow = mote.receiveShadow = false;
      motes.push(mote);
    }
  } else {
    const iron = material('anvil', { metalness: .5, roughness: .48 });
    const ironTop = material('anvil-top', { metalness: .55, roughness: .4 });
    workbench.rotation.y = -.42;
    // The four cuboid proportions follow vanilla's template_anvil.json.
    const scale = 2.65;
    const element = (from, to, mat = iron, rects = null) => box(
      (to[0] - from[0]) * scale, (to[1] - from[1]) * scale, (to[2] - from[2]) * scale,
      mat, ((to[0] + from[0]) / 2 - 8) * scale, (to[1] + from[1]) / 2 * scale,
      ((to[2] + from[2]) / 2 - 8) * scale, workbench, rects);
    element([2, 0, 2], [14, 4, 14]);
    element([4, 4, 3], [12, 5, 13]);
    element([6, 5, 4], [10, 10, 12]);
    element([3, 10, 0], [13, 16, 16], [iron, iron, ironTop, iron, iron, iron],
      [null, null, [3, 0, 10, 16], null, null, null]);

    // A low side bench displays a real 3D hammer and spare metal, leaving the
    // anvil silhouette and the merchant's face unobstructed.
    box(44, 4, 37, wood, 67, 23, 16);
    for (const dx of [-15, 15]) box(5, 22, 5, darkWood, 67 + dx, 10, 16);
    const hammer = new THREE.Group();
    hammer.position.set(63, 28, 19);
    hammer.rotation.y = -.5;
    scene.add(hammer);
    box(3, 3, 24, material('oak-log'), 0, 0, 0, hammer);
    box(13, 6, 7, material('iron', { metalness: .45, roughness: .4 }), 0, 2, -11, hammer);
    for (let i = 0; i < 3; i++) box(18, 5, 11, iron, -68, 3 + i * 5, -51 + i * 2);
    const hearth = material(null, { color: '#ffa752', emissive: '#ff641c', emissiveIntensity: 1.6 });
    box(35, 24, 22, material('stone', { color: '#6c645c' }), -72, 12, -64);
    const glow = box(24, 12, 1, hearth, -72, 12, -52.5);
    glow.castShadow = false;
    const fire = new THREE.PointLight('#ff923e', 700, 105, 2);
    fire.position.set(-68, 20, -43);
    scene.add(fire);
  }

  function resize(w, h) {
    if (disposed) return;
    const width = Math.max(1, Number.isFinite(w) ? w : 1);
    const height = Math.max(1, Number.isFinite(h) ? h : 1);
    camera.aspect = width / height;
    camera.fov = camera.aspect < .8 ? 48 : 42;
    // Shift the set upward: the caller's HTML controls occupy the lower part of
    // the same canvas. Perspective remains shallow enough to see faces.
    camera.setViewOffset(width, height, 0, height * .14, width, height);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  function update(t = 0) {
    if (disposed) return;
    const time = Number.isFinite(t) ? t : 0;
    merchant.userData.animate?.(time, false);
    if (book) {
      book.position.y = 43 + Math.sin(time * 1.4) * 1.4;
      book.rotation.y = Math.sin(time * .45) * .13;
      pageTurn.rotation.z = .15 + (Math.sin(time * 1.2) * .5 + .5) * 2.55;
      motes.forEach((mote, i) => {
        const angle = time * .28 + i * Math.PI * 2 / motes.length;
        mote.position.set(Math.cos(angle) * (26 + i % 3 * 3), 13 + ((time * 6 + i * 4.3) % 34), 23 + Math.sin(angle) * 23);
        mote.rotation.y = -angle;
      });
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    const sceneMaterials = new Set(materials.values());
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        if (mat) sceneMaterials.add(mat);
      }
      if (object.isLight && object.shadow) object.shadow.dispose();
    });
    geometries.forEach(geometry => geometry.dispose());
    sceneMaterials.forEach(mat => mat.dispose());
    ownedTextures.forEach(map => map.dispose());
    scene.environment = null;
    scene.clear();
  }
  resize(1000, 720);
  update(0);
  return { scene, camera, resize, update, dispose };
}
