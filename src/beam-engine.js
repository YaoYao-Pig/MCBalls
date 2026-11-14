export const DEFAULT_BEAM_BOUNDS = Object.freeze({ minX: 30, maxX: 970, minY: 30, maxY: 690 });
export const MAX_BEAM_BOUNCES = 32;
export const MAX_BEAM_RANGE = 20000;
const EPSILON = 1e-6;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const idValid = id => typeof id === 'string' || finite(id);
const point = (x, y) => ({ x, y });

function circleEntry(origin, direction, circle, radius) {
  const x = origin.x - circle.x, y = origin.y - circle.y;
  const projection = x * direction.x + y * direction.y;
  const offset = x * x + y * y - radius * radius;
  if (!finite(projection) || !finite(offset)) return null;
  // A beam born inside another solid is blocked rather than tunnelling out.
  if (offset < -EPSILON) return { distance: 0, inside: true };
  if (Math.abs(offset) <= EPSILON) return projection < -EPSILON ? { distance: 0, inside: false } : null;
  const discriminant = projection * projection - offset;
  if (!finite(discriminant) || discriminant < 0) return null;
  const distance = -projection - Math.sqrt(discriminant);
  return distance >= -EPSILON ? { distance: Math.max(0, distance), inside: false } : null;
}

function wallEntry(origin, direction, bounds) {
  const tx = direction.x > 0 ? (bounds.maxX - origin.x) / direction.x
    : direction.x < 0 ? (bounds.minX - origin.x) / direction.x : Infinity;
  const ty = direction.y > 0 ? (bounds.maxY - origin.y) / direction.y
    : direction.y < 0 ? (bounds.minY - origin.y) / direction.y : Infinity;
  const distance = Math.max(0, Math.min(tx, ty));
  const hitX = Math.abs(tx - distance) <= EPSILON;
  const hitY = Math.abs(ty - distance) <= EPSILON;
  return { distance, hitX, hitY, wall: true };
}

/**
 * State-independent ground-plane ray tracing. All circles use {id,x,y,r};
 * reflectors may also provide kind. origin.id is excluded from reflectors.
 * width is the full beam width. Its half-width expands collision circles and
 * insets the field. A reflector can also be a target: endpoint hits are valid.
 * Targets are pierced once per id. contacts retain every distinct reflection.
 */
export function traceBeam({ origin, angle, range = 1200, maxBounces = 4, width = 0, bounds = DEFAULT_BEAM_BOUNDS, reflectors = [], targets = [] } = {}) {
  const result = { segments: [], hits: [], contacts: [] };
  if (!origin || !finite(origin.x) || !finite(origin.y) || !finite(angle) || !finite(range) || range <= 0) return result;
  const halfWidth = clamp(finite(width) ? width / 2 : 0, 0, 64);
  const arena = {
    minX: bounds?.minX + halfWidth, maxX: bounds?.maxX - halfWidth,
    minY: bounds?.minY + halfWidth, maxY: bounds?.maxY - halfWidth,
  };
  if (!Object.values(arena).every(finite) || arena.minX >= arena.maxX || arena.minY >= arena.maxY) return result;
  const validCircle = circle => circle && idValid(circle.id) && finite(circle.x) && finite(circle.y) && finite(circle.r) && circle.r >= 0;
  const solids = (Array.isArray(reflectors) ? reflectors : []).filter(circle => validCircle(circle) && circle.r + halfWidth > EPSILON && (!idValid(origin.id) || circle.id !== origin.id));
  const victims = (Array.isArray(targets) ? targets : []).filter(circle => validCircle(circle) && (!idValid(origin.id) || circle.id !== origin.id));
  const hitIds = new Set();
  let position = point(clamp(origin.x, arena.minX, arena.maxX), clamp(origin.y, arena.minY, arena.maxY));
  let direction = point(Math.cos(angle), Math.sin(angle));
  let remaining = Math.min(range, MAX_BEAM_RANGE), travelled = 0, zeroContacts = 0;
  const bounceLimit = clamp(Math.floor(finite(maxBounces) ? maxBounces : 0), 0, MAX_BEAM_BOUNCES);

  for (let bounce = 0; bounce <= bounceLimit && remaining > EPSILON; bounce++) {
    let collision = wallEntry(position, direction, arena);
    for (const circle of solids) {
      const hit = circleEntry(position, direction, circle, circle.r + halfWidth);
      if (hit && hit.distance < collision.distance - EPSILON) collision = { ...hit, circle };
    }
    const distance = Math.min(remaining, collision.distance);
    if (!finite(distance)) break;
    // Touching solids must not create a chain of zero-length damage boosts.
    if (distance <= EPSILON && zeroContacts > 0) break;
    zeroContacts = distance <= EPSILON ? zeroContacts + 1 : 0;
    const end = point(position.x + direction.x * distance, position.y + direction.y * distance);
    if (distance > EPSILON) result.segments.push({ from: point(position.x, position.y), to: end, bounce });

    const segmentHits = [];
    for (const target of victims) {
      if (hitIds.has(target.id)) continue;
      const hit = circleEntry(position, direction, target, target.r + halfWidth);
      if (hit && hit.distance <= distance + EPSILON) segmentHits.push({ targetId: target.id, point: point(position.x + direction.x * hit.distance, position.y + direction.y * hit.distance), bounce, distance: travelled + hit.distance });
    }
    segmentHits.sort((a, b) => a.distance - b.distance);
    for (const hit of segmentHits) if (!hitIds.has(hit.targetId)) { hitIds.add(hit.targetId); result.hits.push(hit); }

    travelled += distance; remaining = Math.max(0, remaining - distance);
    if (collision.distance > distance + EPSILON) break;
    if (collision.wall) {
      if (collision.hitX) result.contacts.push({ id: `wall:${direction.x > 0 ? 'right' : 'left'}`, kind: 'wall', point: end, bounce, distance: travelled });
      if (collision.hitY) result.contacts.push({ id: `wall:${direction.y > 0 ? 'bottom' : 'top'}`, kind: 'wall', point: end, bounce, distance: travelled });
      if (collision.hitX) direction.x *= -1;
      if (collision.hitY) direction.y *= -1;
    } else {
      const { circle } = collision;
      result.contacts.push({ id: circle.id, kind: circle.kind || 'reflector', point: end, bounce, distance: travelled });
      if (collision.inside) break;
      const nx = end.x - circle.x, ny = end.y - circle.y, length = Math.hypot(nx, ny);
      if (length <= EPSILON) break;
      const dot = direction.x * nx / length + direction.y * ny / length;
      direction = point(direction.x - 2 * dot * nx / length, direction.y - 2 * dot * ny / length);
      const magnitude = Math.hypot(direction.x, direction.y);
      if (!finite(magnitude) || magnitude <= EPSILON) break;
      direction.x /= magnitude; direction.y /= magnitude;
    }
    position = end;
  }
  return result;
}

/** Primary, echo and prism rays are separate traces. Combat chooses whether
 * their hit sets combine; the geometry itself deduplicates only a single ray. */
export function buildBeamPlan({ angle = 0, echoLevel = 0, prismLevel = 0, turretLevel = 1 } = {}) {
  if (!finite(angle)) return [];
  const echo = clamp(Math.floor(finite(echoLevel) ? echoLevel : 0), 0, 3);
  const prism = clamp(Math.floor(finite(prismLevel) ? prismLevel : 0), 0, 4);
  const turret = clamp(Math.floor(finite(turretLevel) ? turretLevel : 1), 1, 5);
  const base = { range: 900 + turret * 120, maxBounces: 2 + turret, width: 5 + turret };
  const rays = [{ angle, damageScale: 1, ...base }];
  const echoAngles = [0.10, -0.10, 0.20];
  for (let i = 0; i < echo; i++) rays.push({ angle: angle + echoAngles[i], damageScale: 0.7, ...base, range: base.range * 0.9, width: base.width * 0.8 });
  for (let i = 0; i < prism && rays.length + 2 <= 9; i++) {
    const spread = Math.PI / 7 + i * 0.14;
    for (const sign of [-1, 1]) rays.push({ angle: angle + spread * sign, damageScale: 0.45, ...base, range: base.range * 0.85, width: base.width * 0.7 });
  }
  return rays;
}
