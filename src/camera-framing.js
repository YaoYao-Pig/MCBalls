const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (v) => {
  const length = Math.hypot(v.x, v.y, v.z);
  if (length < 1e-9) throw new RangeError('Camera position must differ from its target.');
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};

/** Tightens the existing overview while keeping all four enemy entry bands in view.
 *
 * `width`/`height` and `padding` are CSS pixels. `cameraPosition`/`target` may be
 * plain {x,y,z} objects or THREE.Vector3 objects. The camera's up is (0,1,0).
 * Ground coordinates retain the game's existing mapping: (x-500, 0, y-360).
 *
 * Apply left/right/top/bottom to the existing OrthographicCamera, leave zoom=1,
 * then updateProjectionMatrix(). No camera movement or input remapping is needed.
 * A manual close-up can set protectEntrances=false; default framing fits entries.
 */
export function computeArenaFrustum({
  width, height, cameraPosition, target = { x: 0, y: 12, z: 0 },
  zoom = 1.18, padding = 8, mobHeight = 100, protectEntrances = true,
}) {
  const w = Number.isFinite(width) ? Math.max(1, width) : 1;
  const h = Number.isFinite(height) ? Math.max(1, height) : 1;
  const aspect = w / h;
  const requestedZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1.18;
  const inset = Math.min(Math.max(0, Number.isFinite(padding) ? padding : 8), w * .2, h * .2);
  const headHeight = Number.isFinite(mobHeight) ? Math.max(0, mobHeight) : 100;
  if (!cameraPosition || ![cameraPosition.x, cameraPosition.y, cameraPosition.z, target.x, target.y, target.z].every(Number.isFinite)) {
    throw new TypeError('Camera position and target need finite x/y/z coordinates.');
  }
  const back = unit({ x: cameraPosition.x - target.x, y: cameraPosition.y - target.y, z: cameraPosition.z - target.z });
  let right = cross({ x: 0, y: 1, z: 0 }, back);
  right = Math.hypot(right.x, right.y, right.z) < 1e-9 ? { x: 1, y: 0, z: 0 } : unit(right);
  const up = cross(back, right);

  // core._spawnEnemy uses t in [.08,.92]. These are the two endpoints of
  // each possible entry band, not the distant decorative floor corners.
  const points = [];
  for (const edge of [34, 686]) for (const x of [55 + .08 * 890, 55 + .92 * 890]) for (const y of [0, headHeight]) points.push({ x: x - 500, y, z: edge - 360 });
  for (const edge of [34, 966]) for (const z of [55 + .08 * 610, 55 + .92 * 610]) for (const y of [0, headHeight]) points.push({ x: edge - 500, y, z: z - 360 });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of points) {
    const relative = { x: point.x - target.x, y: point.y - target.y, z: point.z - target.z };
    const x = dot(relative, right), y = dot(relative, up);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const overviewHeight = Math.max(850, 1190 / aspect);
  const desiredHeight = overviewHeight / requestedZoom;
  const fittedHeight = Math.max((maxY - minY) / (1 - 2 * inset / h), (maxX - minX) / (aspect * (1 - 2 * inset / w)));
  const viewHeight = protectEntrances ? Math.max(desiredHeight, fittedHeight) : desiredHeight;
  const viewWidth = viewHeight * aspect;
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  return {
    left: centerX - viewWidth / 2, right: centerX + viewWidth / 2,
    top: centerY + viewHeight / 2, bottom: centerY - viewHeight / 2,
    viewWidth, viewHeight, requestedZoom, actualZoom: overviewHeight / viewHeight,
    limited: viewHeight > desiredHeight + 1e-7,
  };
}
