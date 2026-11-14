import * as THREE from '../vendor/three.module.js';
import { createRealmMobModel } from './realm-models.js';
export { createEndCrystalModel } from './realm-models.js';

// Minecraft skin coordinates are pixels measured from the top left. Models are
// authored in skin-pixel units, stand on y=0, and look along positive Z.
// Cube nets follow Mojang's resource-pack entity convention. The small rigs and
// animations here are independent code; no DOM, canvas or renderer is required.
const ATLAS = {
  zombie: [64, 64], skeleton: [64, 32], creeper: [64, 32],
  enderman: [64, 32], slime: [64, 32], blaze: [64, 32],
  wither: [64, 64], dragon: [256, 256], warden: [128, 128],
  iron_golem: [128, 128], snow_golem: [64, 64], villager: [64, 64],
};
const HEIGHT = { zombie: 64, shield_zombie: 64, skeleton: 64, creeper: 48, enderman: 94, slime: 32, blaze: 55, wither: 90, warden: 100, iron_golem: 92, snow_golem: 65, villager: 64, librarian: 64, toolsmith: 64, weaponsmith: 64 };
const TINT = { zombie: 0x6b9460, skeleton: 0xd8d2b9, creeper: 0x63a041, enderman: 0x28212e, slime: 0x79bd55, blaze: 0xffbd44, wither: 0x33313a, dragon: 0x29222f, warden: 0x174b4b, iron_golem: 0xd2d0b9, snow_golem: 0xf4f3e9, villager: 0x99745b };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function configureTexture(texture) {
  if (!texture) return;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
}

function skinMaterial(texture, color, options = {}) {
  configureTexture(texture);
  return new THREE.MeshLambertMaterial({ map: texture || null, color: texture ? 0xffffff : color, alphaTest: .05, ...options });
}

// BoxGeometry faces: +X, -X, +Y, -Y, +Z (front), -Z (back).
// Mirroring exchanges the side panels as well as reversing their horizontal UV.
function boxGeometry(w, h, d, u, v, atlas, flipY = true, mirror = false, inflate = 0, skinSize = null) {
  const [sw, sh, sd] = skinSize || [w, h, d];
  const geometry = new THREE.BoxGeometry(Math.max(.04, w + inflate * 2), Math.max(.04, h + inflate * 2), Math.max(.04, d + inflate * 2));
  const faces = [
    [u + sd + sw, v + sd, sd, sh], [u, v + sd, sd, sh],
    [u + sd, v, sw, sd], [u + sd + sw, v, sw, sd],
    [u + sd, v + sd, sw, sh], [u + sd * 2 + sw, v + sd, sw, sh],
  ];
  if (mirror) [faces[0], faces[1]] = [faces[1], faces[0]];
  const uv = geometry.attributes.uv;
  for (let face = 0; face < 6; face++) {
    let [x, y, width, height] = faces[face];
    // A zero-thickness skin plane has no side artwork. Our tiny physical edge
    // samples one valid edge texel instead of wrapping negative atlas offsets.
    if (width === 0 || height === 0) { x = clamp(x, 0, atlas[0]); y = clamp(y, 0, atlas[1]); width = 0; height = 0; }
    for (let vertex = 0; vertex < 4; vertex++) {
      const index = face * 4 + vertex;
      let a = uv.getX(index), b = 1 - uv.getY(index);
      if (mirror) a = 1 - a;
      if (face === 3) b = 1 - b;
      const px = (x + a * width) / atlas[0], py = (y + b * height) / atlas[1];
      uv.setXY(index, px, flipY ? 1 - py : py);
    }
  }
  return geometry;
}

function setup(kind, textures, skin = kind) {
  const root = new THREE.Group(); root.name = `mob:${kind}`;
  const rig = new THREE.Group(); root.add(rig);
  const texture = textures[skin] || textures[skin.replaceAll('_', '-')] || null;
  const material = skinMaterial(texture, TINT[skin] || 0x999999);
  const bones = {};
  const materials = new Set([material]);
  function bone(name, x = 0, y = 0, z = 0, parent = rig) {
    const group = new THREE.Group(); group.name = name; group.position.set(x, y, z); parent.add(group); bones[name] = group; return group;
  }
  function cube(parent, w, h, d, x, y, z, u = 0, v = 0, options = {}) {
    const selectedTexture = options.texture === undefined ? texture : options.texture;
    const selectedMaterial = options.material || material;
    materials.add(selectedMaterial);
    const geometry = boxGeometry(w, h, d, u, v, options.atlas || ATLAS[skin], selectedTexture?.flipY !== false, !!options.mirror, options.inflate || 0, options.skinSize);
    const mesh = new THREE.Mesh(geometry, selectedMaterial); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function solid(parent, w, h, d, x, y, z, color, options = {}) {
    const material = skinMaterial(null, color, options); materials.add(material);
    return cube(parent, w, h, d, x, y, z, 0, 0, { material });
  }
  function finish(naturalHeight, animate = () => {}) {
    if (HEIGHT[kind]) rig.scale.setScalar(HEIGHT[kind] / naturalHeight);
    root.userData.kind = kind;
    root.userData.head = bones.head || rig;
    root.userData.bones = bones;
    root.userData.materials = [...materials];
    root.userData.height = HEIGHT[kind] || naturalHeight;
    root.userData.animate = (t = 0, moving = true) => {
      const time = Number.isFinite(t) ? t : 0;
      const amount = typeof moving === 'number' ? clamp(moving, 0, 1) : moving ? 1 : 0;
      animate(time, amount);
    };
    root.userData.animate(0, 0);
    return root;
  }
  return { root, rig, bones, texture, material, bone, cube, solid, finish };
}

function humanoid(kind, textures) {
  const skin = kind === 'shield_zombie' ? 'zombie' : kind;
  const m = setup(kind, textures, skin), { bone, cube } = m;
  const skeleton = kind === 'skeleton', enderman = kind === 'enderman';
  const legLength = enderman ? 30 : 12, limb = skeleton || enderman ? 2 : 4;
  const torsoY = legLength + 6, shoulderY = legLength + 10;
  const body = bone('body', 0, torsoY, 0); cube(body, 8, 12, 4, 0, 0, 0, enderman ? 32 : 16, 16);
  const head = bone('head', 0, legLength + 12, 0); cube(head, 8, 8, 8, 0, 4, 0);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const mirror = side > 0;
    const leg = bone(side < 0 ? 'rightLeg' : 'leftLeg', side * 2, legLength, 0);
    cube(leg, limb, legLength, limb, 0, -legLength / 2, 0, enderman ? 56 : 0, enderman ? 0 : 16, { mirror }); legs.push(leg);
    const armLength = enderman ? 30 : 12;
    const arm = bone(side < 0 ? 'rightArm' : 'leftArm', side * (4 + limb / 2), shoulderY, 0);
    cube(arm, limb, armLength, limb, 0, -armLength / 2 + 2, 0, enderman ? 56 : 40, enderman ? 0 : 16, { mirror }); arms.push(arm);
  }
  if (enderman) {
    const eyes = skinMaterial(null, 0xda84ff, { emissive: 0xa54bdb, emissiveIntensity: .8 });
    cube(head, 3, .65, .06, -2, 4, 4.04, 0, 0, { material: eyes });
    cube(head, 3, .65, .06, 2, 4, 4.04, 0, 0, { material: eyes });
  }
  if (kind === 'shield_zombie') {
    const shield = bone('shield', 0, -5, 3.6, arms[1]);
    m.solid(shield, 9, 13, 1.3, 0, 0, 0, 0x65513a);
    m.solid(shield, 10, 1.3, 1.6, 0, 6.4, .1, 0xb6b8ad);
    m.solid(shield, 10, 1.3, 1.6, 0, -6.4, .1, 0xb6b8ad);
    for (const side of [-1, 1]) m.solid(shield, 1.1, 13, 1.6, side * 4.5, 0, .1, 0xb6b8ad);
    m.solid(shield, 2, 13, 1.6, 0, 0, .15, 0x8e8069);
    m.root.userData.shield = shield;
  }
  return m.finish(legLength + 20, (t, moving) => {
    const stride = Math.sin(t * (enderman ? 5.5 : 7)) * .5 * moving;
    legs[0].rotation.x = stride; legs[1].rotation.x = -stride;
    m.rig.position.y = -(legLength * (1 - Math.cos(stride)) - limb / 2 * Math.abs(Math.sin(stride))) * m.rig.scale.y;
    arms[0].rotation.x = (skin === 'zombie' ? -1.2 : 0) - stride * .65;
    arms[1].rotation.x = (skin === 'zombie' ? -1.2 : 0) + stride * .65;
    head.rotation.y = Math.sin(t * 1.4) * .08;
  });
}

function creeper(textures) {
  const m = setup('creeper', textures), { bone, cube } = m;
  const head = bone('head', 0, 18, 0); cube(head, 8, 8, 8, 0, 4, 0);
  cube(m.rig, 8, 12, 4, 0, 12, 0, 16, 16);
  const legs = [];
  for (const z of [-3, 3]) for (const x of [-2, 2]) {
    const leg = bone(`leg${legs.length}`, x, 6, z); cube(leg, 4, 6, 4, 0, -3, 0, 0, 16); legs.push(leg);
  }
  return m.finish(26, (t, moving) => legs.forEach((leg, i) => { leg.rotation.x = Math.sin(t * 9 + (i === 0 || i === 3 ? 0 : Math.PI)) * .55 * moving; }));
}

function slime(textures) {
  const m = setup('slime', textures), { cube } = m;
  cube(m.rig, 6, 6, 6, 0, 3.5, 0, 0, 16);
  cube(m.rig, 2, 2, 2, -2, 4, 3.1, 32, 0);
  cube(m.rig, 2, 2, 2, 2, 4, 3.1, 32, 0);
  cube(m.rig, 1, 1, 1, 0, 2.5, 3.4, 32, 4);
  const shell = skinMaterial(m.texture, TINT.slime, { transparent: true, opacity: .46, depthWrite: false, alphaTest: .01 });
  cube(m.rig, 8, 8, 8, 0, 4, 0, 0, 0, { material: shell });
  return m.finish(8, (t, moving) => {
    const squash = Math.sin(t * 6) * .15 * moving;
    m.rig.scale.set(4 * (1 - squash * .4), 4 * (1 + squash), 4 * (1 - squash * .4));
    m.rig.position.y = Math.max(0, Math.sin(t * 6)) * 3 * moving;
  });
}

function blaze(textures) {
  const m = setup('blaze', textures), { bone, cube } = m;
  const head = bone('head', 0, 23, 0); cube(head, 8, 8, 8, 0, 0, 0);
  m.material.emissive.setHex(0x8a3f08); m.material.emissiveIntensity = .4;
  const rings = [];
  for (let layer = 0; layer < 3; layer++) {
    const ring = bone(`rodRing${layer}`, 0, 5 + layer * 7, 0); rings.push(ring);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + layer * .45, radius = 8 - layer;
      const rod = cube(ring, 2, 8, 2, Math.cos(angle) * radius, 0, Math.sin(angle) * radius, 0, 16);
      rod.rotation.z = Math.cos(angle) * .12;
    }
  }
  return m.finish(27, (t) => {
    rings.forEach((ring, i) => { ring.rotation.y = t * (i % 2 ? -.9 : .7) + i; ring.position.y = 5 + i * 7 + Math.sin(t * 2 + i) * .6; });
    head.position.y = 23 + Math.sin(t * 2) * .45;
  });
}

function wither(textures) {
  const m = setup('wither', textures), { bone, cube } = m;
  const body = bone('body', 0, 14, 0); cube(body, 3, 12, 3, 0, 0, 0, 0, 22);
  cube(body, 20, 3, 3, 0, 5, 0, 0, 16);
  for (let i = 0; i < 3; i++) cube(body, 11, 2, 2, 0, 1 - i * 3.6, 1.8, 0, 32);
  const tail = bone('tail', 0, 9, 0); cube(tail, 3, 9, 3, 0, -4.5, 0, 12, 22); tail.rotation.x = -.24;
  const head = bone('head', 0, 24, 0); cube(head, 8, 8, 8, 0, 0, 0);
  const heads = [head];
  for (const side of [-1, 1]) { const h = bone(`sideHead${side}`, side * 9, 21, 0); cube(h, 6, 6, 6, 0, 0, 0, 32, 0); heads.push(h); }
  return m.finish(28, (t) => {
    heads.forEach((head, i) => { head.rotation.y = Math.sin(t * 1.2 + i) * .25; });
    tail.rotation.x = -.24 + Math.sin(t * 2.3) * .15;
    m.rig.position.y = 3 + Math.sin(t * 2) * 2;
  });
}

function warden(textures) {
  const m = setup('warden', textures), { bone, cube } = m;
  const body = bone('body', 0, 23.5, -1.5); cube(body, 18, 21, 11, 0, 0, 0, 0, 0);
  for (const side of [-1, 1]) cube(body, 9, 21, .12, side * 4.5, 0, 5.62, 90, 11, { skinSize: [9, 21, 0], mirror: side > 0 });
  const head = bone('head', 0, 34, 0); cube(head, 16, 16, 10, 0, 8, 0, 0, 32);
  const legs = [], arms = [], horns = [];
  for (const side of [-1, 1]) {
    const leg = bone(`leg${side}`, side * 6, 13, 0); cube(leg, 6, 13, 6, 0, -6.5, 0, 76, side < 0 ? 48 : 76); legs.push(leg);
    const arm = bone(`arm${side}`, side * 13, 34, -1); cube(arm, 8, 28, 8, 0, -14, 0, side < 0 ? 44 : 0, side < 0 ? 50 : 58); arms.push(arm);
    const horn = bone(`tendril${side}`, side * 8, 12, 0, head);
    cube(horn, 16, 16, .25, side * 8, 5, 0, side < 0 ? 52 : 58, side < 0 ? 32 : 0, { skinSize: [16, 16, 0] }); horns.push(horn);
  }
  return m.finish(59, (t, moving) => {
    const walk = Math.sin(t * 4.5) * .35 * moving;
    legs[0].rotation.x = walk; legs[1].rotation.x = -walk;
    arms[0].rotation.x = -.1 - walk; arms[1].rotation.x = -.1 + walk;
    head.rotation.z = Math.sin(t * 1.7) * .08;
    horns.forEach((horn, i) => { horn.rotation.x = Math.sin(t * 4 + i) * .2; });
  });
}

function dragon(textures) {
  const m = setup('dragon', textures), { bone, cube } = m;
  const body = bone('body', 0, 23, -8); cube(body, 24, 24, 64, 0, 0, 0, 0, 0);
  for (let i = 0; i < 3; i++) cube(body, 2, 6, 12, 0, 15, -24 + i * 22, 220, 53);
  const necks = [], tails = [];
  for (let i = 0; i < 3; i++) {
    const neck = bone(`neck${i}`, 0, 27 + i, 27 + i * 9);
    cube(neck, 10, 10, 10, 0, 0, 0, 192, 104); cube(neck, 2, 4, 6, 0, 7, -1, 48, 0); necks.push(neck);
  }
  const head = bone('head', 0, 30, 61); cube(head, 16, 16, 16, 0, 0, 0, 112, 30);
  cube(head, 12, 5, 16, 0, -2, 16, 176, 44);
  const jaw = bone('jaw', 0, -6, 8, head); cube(jaw, 12, 4, 16, 0, 0, 8, 176, 65);
  for (const side of [-1, 1]) cube(head, 2, 6, 4, side * 5, 10, -3, 0, 0);
  for (let i = 0; i < 7; i++) {
    const tail = bone(`tail${i}`, 0, 23 - i * 1.6, -45 - i * 9);
    const width = Math.max(3, 9 - i * .8);
    cube(tail, width, width, 10, 0, 0, 0, 192, 104, { skinSize: [10, 10, 10] });
    cube(tail, 2, 4, 6, 0, width / 2 + 2, 0, 48, 0); tails.push(tail);
  }
  const wings = [], tips = [];
  const membrane = skinMaterial(m.texture, TINT.dragon, { side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const wing = bone(`wing${side}`, side * 10, 30, 5); wings.push(wing);
    cube(wing, 56, 8, 8, side * 28, 0, 0, 112, 88, { mirror: side < 0 });
    // Thin boxes retain front/back surfaces instead of camera-facing sprites.
    cube(wing, 56, .2, 56, side * 28, -1, -28, -56, 88, { material: membrane, skinSize: [56, 0, 56], mirror: side < 0 });
    const tip = bone(`wingTip${side}`, side * 56, 0, 0, wing); tips.push(tip);
    cube(tip, 56, 4, 4, side * 28, 0, 0, 112, 136, { mirror: side < 0 });
    cube(tip, 56, .2, 56, side * 28, -.8, -28, -56, 144, { material: membrane, skinSize: [56, 0, 56], mirror: side < 0 });
    for (const z of [-24, 15]) {
      const leg = bone(`leg${side}:${z}`, side * 10, 14, z);
      cube(leg, 8, 18, 8, 0, -5, 0, 112, 0);
      cube(leg, 10, 4, 14, 0, -12, 4, 144, 0);
    }
  }
  // Horizontal span 244 -> 180. Body length is deliberately compact in the arena.
  m.rig.scale.set(180 / 244, .85, 140 / 180);
  return m.finish(48, (t) => {
    wings.forEach((wing, i) => { const side = i === 0 ? -1 : 1; wing.rotation.z = side * (.08 + Math.sin(t * 3.3) * .32); tips[i].rotation.z = side * (.12 + Math.sin(t * 3.3 + .7) * .22); });
    tails.forEach((tail, i) => { tail.position.x = Math.sin(t * 2 - i * .4) * (i + 1) * .65; tail.rotation.y = Math.sin(t * 2 - i * .4) * .12; });
    necks.forEach((neck, i) => { neck.position.y = 27 + i + Math.sin(t * 2 + i * .4) * .5; });
    jaw.rotation.x = .08 + (Math.sin(t * 1.3) + 1) * .07;
  });
}

function golem(kind, textures) {
  const iron = kind === 'iron_golem', m = setup(kind, textures), { bone, cube } = m;
  if (!iron) {
    cube(m.rig, 12, 12, 12, 0, 6, 0, 0, 36);
    cube(m.rig, 10, 10, 10, 0, 17, 0, 0, 16);
    const head = bone('head', 0, 22, 0); cube(head, 8, 8, 8, 0, 4, 0);
    const arms = [];
    for (const side of [-1, 1]) { const arm = bone(`arm${side}`, side * 4, 19, 0); cube(arm, 12, 2, 2, side * 6, 0, 0, 32, 0); arm.rotation.z = side * .15; arms.push(arm); }
    return m.finish(30, (t, moving) => { head.rotation.y = Math.sin(t) * .1; arms.forEach((arm, i) => { arm.rotation.y = Math.sin(t * 5 + i) * .12 * moving; }); });
  }
  cube(m.rig, 18, 12, 11, 0, 27, 0, 0, 40);
  cube(m.rig, 9, 5, 6, 0, 18.5, 0, 0, 70);
  const head = bone('head', 0, 33, 0); cube(head, 8, 10, 8, 0, 5, 0);
  cube(head, 2, 4, 2, 0, 3, 5, 24, 0);
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = bone(`leg${side}`, side * 4, 16, 0); cube(leg, 6, 16, 5, 0, -8, 0, side < 0 ? 37 : 60, 0); legs.push(leg);
    const arm = bone(`arm${side}`, side * 12, 31, 0); cube(arm, 4, 30, 6, 0, -14, 0, side < 0 ? 60 : 60, side < 0 ? 21 : 58); arms.push(arm);
  }
  return m.finish(43, (t, moving) => { const stride = Math.sin(t * 4) * .3 * moving; legs[0].rotation.x = stride; legs[1].rotation.x = -stride; arms[0].rotation.x = -stride; arms[1].rotation.x = stride; });
}

function villager(kind, textures) {
  const m = setup(kind, textures, 'villager'), { bone, cube } = m;
  const clothes = textures.villager_plains || textures['villager-plains'];
  const overlays = [clothes, textures[kind === 'villager' ? 'toolsmith' : kind]].filter(Boolean).map(texture => ({ texture, material: skinMaterial(texture, 0xffffff, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }) }));
  function dressed(parent, w, h, d, x, y, z, u, v) {
    cube(parent, w, h, d, x, y, z, u, v);
    overlays.forEach((overlay, i) => cube(parent, w, h, d, x, y, z, u, v, { ...overlay, inflate: .015 + i * .015 }));
  }
  const head = bone('head', 0, 24, 0); dressed(head, 8, 10, 8, 0, 5, 0, 0, 0);
  dressed(head, 2, 4, 2, 0, 2, 5, 24, 0);
  dressed(m.rig, 8, 12, 6, 0, 18, 0, 16, 20);
  dressed(m.rig, 8, 18, 6, 0, 15, 0, 0, 38);
  const arms = bone('arms', 0, 21, 0);
  for (const side of [-1, 1]) dressed(arms, 4, 8, 4, side * 4, -3, 1, 44, 22);
  dressed(arms, 8, 4, 4, 0, -6, 4, 40, 38);
  const legs = [];
  for (const side of [-1, 1]) { const leg = bone(`leg${side}`, side * 2, 12, 0); dressed(leg, 4, 12, 4, 0, -6, 0, 0, 22); legs.push(leg); }
  if (kind === 'librarian') {
    m.solid(head, 9, 1, 9, 0, 10.6, 0, 0x674d31);
    m.solid(head, 7.5, 2, 7.5, 0, 12, 0, 0xc6b18b);
    m.solid(head, 7, .5, 8, 0, 13.25, 0, 0xf0e4bd);
  }
  return m.finish(kind === 'librarian' ? 38 : 34, (t, moving) => {
    const stride = Math.sin(t * 6) * .3 * moving; legs[0].rotation.x = stride; legs[1].rotation.x = -stride;
    head.rotation.y = Math.sin(t * .8) * .12; head.rotation.x = Math.sin(t * 1.4) * .035;
    arms.rotation.x = -.1 + Math.sin(t * 1.2) * .025;
  });
}

/** Creates an independent, genuinely three-dimensional rig. Textures may still
 * be loading: UV atlas dimensions never depend on texture.image availability.
 * Caller owns positioning, heading and collision-scale changes on this root.
 * Call root.userData.animate(seconds, moving) once per frame. */
export function createMobModel(kind, textures = {}) {
  const realmMob = createRealmMobModel(kind, textures);
  if (realmMob) return realmMob;
  if (['zombie', 'shield_zombie', 'skeleton', 'enderman'].includes(kind)) return humanoid(kind, textures);
  if (kind === 'creeper') return creeper(textures);
  if (kind === 'slime') return slime(textures);
  if (kind === 'blaze') return blaze(textures);
  if (kind === 'wither') return wither(textures);
  if (kind === 'warden') return warden(textures);
  if (kind === 'dragon') return dragon(textures);
  if (kind === 'iron_golem' || kind === 'snow_golem') return golem(kind, textures);
  if (['villager', 'librarian', 'toolsmith', 'weaponsmith'].includes(kind)) return villager(kind, textures);
  const fallback = humanoid('zombie', textures); fallback.userData.kind = kind; return fallback;
}
