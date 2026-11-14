import test from 'node:test';
import assert from 'node:assert/strict';
import { traceBeam, buildBeamPlan, MAX_BEAM_BOUNCES, MAX_BEAM_RANGE } from '../src/beam-engine.js';

const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} should equal ${b}`);
const length = segment => Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
const circle = (id, x, y, r = 10, kind = 'ball') => ({ id, x, y, r, kind });

test('a straight beam pierces targets in path order and respects its range', () => {
  const result = traceBeam({ origin: { x: 100, y: 200 }, angle: 0, range: 400, targets: [circle('far', 450, 200), circle('near', 180, 200), circle('outside', 550, 200)] });
  assert.deepEqual(result.hits.map(hit => hit.targetId), ['near', 'far']);
  assert.deepEqual(result.segments, [{ from: { x: 100, y: 200 }, to: { x: 500, y: 200 }, bounce: 0 }]);
  assert.equal(result.hits[0].distance, 70);
  assert.equal(result.hits[1].distance, 340);
  assert.equal(result.contacts.length, 0);
});

test('wall reflections consume range and cannot repeatedly damage the same enemy', () => {
  const result = traceBeam({ origin: { x: 500, y: 200 }, angle: 0, range: 1500, maxBounces: 3, targets: [circle('right', 900, 200), circle('left', 100, 200), circle('right', 900, 200)] });
  assert.equal(result.segments.length, 3);
  close(result.segments[0].to.x, 970); close(result.segments[1].to.x, 30); close(result.segments[2].to.x, 120);
  close(result.segments.reduce((sum, segment) => sum + length(segment), 0), 1500);
  assert.deepEqual(result.hits.map(hit => hit.targetId), ['right', 'left']);
  assert.deepEqual(result.hits.map(hit => hit.bounce), [0, 1]);
  assert.equal(result.hits[1].distance, 1330);
  assert.deepEqual(result.contacts.map(contact => contact.id), ['wall:right', 'wall:left']);
});

test('the base reflects the ray and shields enemies on its far side', () => {
  const result = traceBeam({ origin: { x: 300, y: 360 }, angle: 0, range: 400, reflectors: [circle('base', 500, 360, 42, 'base')], targets: [circle('front', 350, 360), circle('behind', 600, 360)] });
  close(result.segments[0].to.x, 458);
  close(result.segments[1].to.x, 216);
  assert.deepEqual(result.hits.map(hit => hit.targetId), ['front']);
  assert.equal(result.contacts[0].id, 'base');
  assert.equal(result.contacts[0].kind, 'base');
  assert.equal(result.contacts[0].distance, 158);
});

test('oblique circle reflection follows the surface normal rather than an axis flip', () => {
  const result = traceBeam({ origin: { x: 300, y: 340 }, angle: 0, range: 250, reflectors: [circle('mirror', 500, 360, 40)] });
  const [incoming, outgoing] = result.segments;
  close(incoming.to.x, 500 - Math.sqrt(1200)); close(incoming.to.y, 340);
  const distance = length(outgoing);
  close((outgoing.to.x - outgoing.from.x) / distance, -0.5);
  close((outgoing.to.y - outgoing.from.y) / distance, -Math.sqrt(3) / 2);
  close(length(incoming) + distance, 250);
});

test('corner impacts reverse both components but consume only one bounce', () => {
  const distance = Math.hypot(470, 330);
  const result = traceBeam({ origin: { x: 500, y: 360 }, angle: Math.atan2(330, 470), range: distance + 100, maxBounces: 1 });
  assert.equal(result.segments.length, 2);
  close(result.segments[0].to.x, 970); close(result.segments[0].to.y, 690);
  close(result.segments[1].to.x, 970 - 470 / distance * 100);
  close(result.segments[1].to.y, 690 - 330 / distance * 100);
  assert.equal(result.segments[1].bounce, 1);
  assert.deepEqual(result.contacts.map(contact => contact.id), ['wall:right', 'wall:bottom']);
});

test('resource and crystal endpoint contacts can also be damaged as targets', () => {
  for (const kind of ['resource', 'crystal']) {
    const obstacle = circle(`${kind}:7`, 400, 200, 20, kind);
    const result = traceBeam({ origin: { x: 100, y: 200 }, angle: 0, range: 400, maxBounces: 0, reflectors: [obstacle], targets: [obstacle, circle('behind', 450, 200)] });
    assert.equal(result.segments.length, 1);
    assert.equal(result.hits.length, 1);
    assert.equal(result.hits[0].targetId, obstacle.id);
    assert.equal(result.hits[0].point.x, 380);
    assert.deepEqual(result.contacts, [{ id: obstacle.id, kind, point: { x: 380, y: 200 }, bounce: 0, distance: 280 }]);
  }
});

test('the source ball is excluded by id without mutating input geometry', () => {
  const source = Object.freeze(circle('ball:1', 150, 150, 16));
  const result = traceBeam({ origin: source, angle: 0, range: 200, reflectors: [source], targets: [source, circle('enemy:2', 300, 150)] });
  assert.equal(result.contacts.length, 0);
  assert.deepEqual(result.hits.map(hit => hit.targetId), ['enemy:2']);
  assert.deepEqual(result.segments[0], { from: { x: 150, y: 150 }, to: { x: 350, y: 150 }, bounce: 0 });
});

test('beam width inflates target and reflector circles and insets boundaries', () => {
  const wide = traceBeam({ origin: { x: 500, y: 200 }, angle: 0, range: 600, width: 8, maxBounces: 0, targets: [circle('grazing', 650, 213, 10)] });
  assert.equal(wide.hits.length, 1);
  assert.equal(wide.segments[0].to.x, 966);
  const narrow = traceBeam({ origin: { x: 500, y: 200 }, angle: 0, range: 600, width: 0, maxBounces: 0, targets: [circle('grazing', 650, 213, 10)] });
  assert.equal(narrow.hits.length, 0);
  const reflected = traceBeam({ origin: { x: 300, y: 360 }, angle: 0, width: 8, range: 300, reflectors: [circle('base', 500, 360, 42)] });
  close(reflected.segments[0].to.x, 454);
});

test('a source on a wall or circle can turn inward without zero-length segment loops', () => {
  const boundary = traceBeam({ origin: { x: 970, y: 200 }, angle: 0, range: 100, maxBounces: 4 });
  assert.equal(boundary.contacts.length, 1);
  assert.equal(boundary.segments.length, 1);
  close(boundary.segments[0].to.x, 870);
  assert.equal(boundary.segments[0].bounce, 1);
  const surface = traceBeam({ origin: { x: 460, y: 360 }, angle: 0, range: 100, reflectors: [circle('mirror', 500, 360, 40)] });
  assert.equal(surface.contacts.length, 1);
  assert.equal(surface.segments.length, 1);
  close(surface.segments[0].to.x, 360);
  assert.ok(surface.segments.every(segment => length(segment) > 0));
});

test('overlapping and touching solids cannot generate repeated zero-travel bonuses', () => {
  const trapped = traceBeam({ origin: { x: 500, y: 360 }, angle: 0, range: 1000, reflectors: [circle('left', 460, 360, 40), circle('right', 540, 360, 40)] });
  assert.equal(trapped.contacts.length, 1);
  assert.equal(trapped.segments.length, 0);
  const inside = traceBeam({ origin: { x: 500, y: 360 }, angle: 0, range: 1000, reflectors: [circle('base', 500, 360, 42)], targets: [circle('outside', 600, 360)] });
  assert.equal(inside.segments.length, 0);
  assert.equal(inside.contacts.length, 1);
  assert.equal(inside.hits.length, 0);
});

test('bounce limits stop at the final obstruction and custom bounds are respected', () => {
  const result = traceBeam({ origin: { x: 50, y: 50 }, angle: 0, range: 1000, maxBounces: 1, bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 } });
  assert.equal(result.segments.length, 2);
  assert.deepEqual(result.segments.map(segment => segment.to.x), [100, 0]);
  close(result.segments.reduce((sum, segment) => sum + length(segment), 0), 150);
});

test('invalid input is harmless and extreme ray budgets remain bounded', () => {
  for (const config of [{}, { origin: { x: NaN, y: 200 }, angle: 0 }, { origin: { x: 200, y: 200 }, angle: Infinity }, { origin: { x: 200, y: 200 }, angle: 0, range: Infinity }, { origin: { x: 200, y: 200 }, angle: 0, bounds: {} }]) assert.deepEqual(traceBeam(config), { segments: [], hits: [], contacts: [] });
  const extreme = traceBeam({ origin: { x: -9999, y: 200 }, angle: 0.013, range: Number.MAX_VALUE, maxBounces: Number.MAX_VALUE, width: 1, reflectors: [circle('invalid', Infinity, 200, 20)] });
  assert.ok(extreme.segments.length <= MAX_BEAM_BOUNCES + 1);
  assert.ok(extreme.segments.reduce((sum, segment) => sum + length(segment), 0) <= MAX_BEAM_RANGE + 1e-6);
  for (const segment of extreme.segments) for (const p of [segment.from, segment.to]) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test('near-horizontal paths cannot escape a boundary because their normal component is small', () => {
  const result = traceBeam({ origin: { x: 100, y: 30 }, angle: -1e-7, range: 1500, maxBounces: 4 });
  assert.equal(result.contacts[0].id, 'wall:top');
  for (const segment of result.segments) for (const p of [segment.from, segment.to]) assert.ok(p.y >= 30 - 1e-6 && p.y <= 690 + 1e-6);
});

test('beam plans keep the primary aim and distinguish echo and symmetric prism strength', () => {
  const plan = buildBeamPlan({ angle: 0.7, echoLevel: 2, prismLevel: 2, turretLevel: 3 });
  assert.equal(plan.length, 7);
  assert.equal(plan[0].angle, 0.7);
  assert.equal(plan[0].damageScale, 1);
  assert.equal(plan[0].range, 1260);
  assert.equal(plan[0].maxBounces, 5);
  assert.equal(plan.filter(ray => ray.damageScale === 0.7).length, 2);
  const split = plan.filter(ray => ray.damageScale === 0.45);
  assert.equal(split.length, 4);
  close((split[0].angle + split[1].angle) / 2, 0.7);
  close((split[2].angle + split[3].angle) / 2, 0.7);
});

test('all enhancement combinations cap beams at nine and produce valid trace parameters', () => {
  assert.deepEqual(buildBeamPlan({ angle: NaN }), []);
  for (let echoLevel = -1; echoLevel <= 8; echoLevel++) for (let prismLevel = -1; prismLevel <= 8; prismLevel++) {
    const plan = buildBeamPlan({ angle: 0.1, echoLevel, prismLevel, turretLevel: 100 });
    assert.ok(plan.length >= 1 && plan.length <= 9);
    assert.equal(plan.filter(ray => ray.damageScale === 0.45).length % 2, 0);
    for (const ray of plan) {
      const trace = traceBeam({ origin: { x: 500, y: 460 }, ...ray });
      assert.ok(trace.segments.length > 0);
      assert.ok(trace.segments.length <= ray.maxBounces + 1);
      for (const value of Object.values(ray)) assert.ok(Number.isFinite(value));
    }
  }
});
