import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { computeArenaFrustum } from '../src/camera-framing.js';

function cameraAt(azimuth, width, height, extra = {}) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000);
  camera.position.set(Math.sin(azimuth) * 1050, 1000, Math.cos(azimuth) * 830);
  camera.lookAt(0, 12, 0);
  const framing = computeArenaFrustum({ width, height, cameraPosition: camera.position, ...extra });
  for (const name of ['left', 'right', 'top', 'bottom']) camera[name] = framing[name];
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  return { camera, framing };
}

test('default close-up increases object scale while a front-facing mobile view reaches 18%', () => {
  const { framing } = cameraAt(.16, 1000, 720);
  assert.ok(framing.actualZoom >= 1.14 && framing.actualZoom <= 1.18);
  const mobile = cameraAt(0, 362, 326).framing;
  assert.ok(Math.abs(mobile.actualZoom - 1.18) < 1e-9);
});

test('all entry feet and heads remain inset across eight rotations and narrow layouts', () => {
  for (const [width, height] of [[1000, 720], [362, 326], [390, 600]]) {
    for (let turn = 0; turn < 8; turn++) {
      const { camera } = cameraAt(.16 + turn * Math.PI / 4, width, height);
      for (const t of [.08, .2, .5, .8, .92]) for (const elevation of [0, 50, 100]) {
        const points = [[55 + t * 890, 34], [966, 55 + t * 610], [55 + t * 890, 686], [34, 55 + t * 610]];
        for (const [x, y] of points) {
          const ndc = new THREE.Vector3(x - 500, elevation, y - 360).project(camera);
          const sx = (ndc.x + 1) * width / 2, sy = (1 - ndc.y) * height / 2;
          assert.ok(sx >= 8 - 1e-7 && sx <= width - 8 + 1e-7, `horizontal entry cropped: ${width}, ${turn}`);
          assert.ok(sy >= 8 - 1e-7 && sy <= height - 8 + 1e-7, `vertical entry cropped: ${width}, ${turn}`);
        }
      }
    }
  }
});

test('asymmetric framing preserves project-to-raycast ground coordinates', () => {
  for (let turn = 0; turn < 8; turn++) {
    const { camera } = cameraAt(.16 + turn * Math.PI / 4, 362, 326);
    const raycaster = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    for (const [x, y] of [[100, 100], [500, 360], [700, 500], [900, 650]]) {
      const p = new THREE.Vector3(x - 500, 0, y - 360), projected = p.clone().project(camera);
      raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
      const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      assert.ok(hit && hit.distanceTo(p) < 1e-7);
    }
  }
});

test('optional manual zoom can exceed the automatic framing limit', () => {
  const auto = cameraAt(Math.PI / 4, 1000, 720, { zoom: 1.5 }).framing;
  const manual = cameraAt(Math.PI / 4, 1000, 720, { zoom: 1.5, protectEntrances: false }).framing;
  assert.equal(auto.limited, true);
  assert.equal(manual.limited, false);
  assert.ok(Math.abs(manual.actualZoom - 1.5) < 1e-9);
  assert.ok(auto.viewHeight > manual.viewHeight);
});

test('temporarily collapsed layout and a top-down camera produce finite bounds', () => {
  for (const size of [0, 1, 10]) {
    const frame = computeArenaFrustum({ width: size, height: size, cameraPosition: { x: 0, y: 1000, z: 0 } });
    assert.ok([frame.left, frame.right, frame.top, frame.bottom].every(Number.isFinite));
    assert.ok(frame.right > frame.left && frame.top > frame.bottom);
  }
});
