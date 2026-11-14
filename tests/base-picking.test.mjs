import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { WorldRenderer } from '../src/three-renderer.js';

function fixture(){
  const world=Object.create(WorldRenderer.prototype);
  Object.assign(world,{scene:new THREE.Scene(),textures:{},materials:new Map(),meshes:new Map(),width:1000,height:720,azimuth:.16,raycaster:new THREE.Raycaster(),camera:new THREE.OrthographicCamera(-560,560,410,-410,1,3000)});
  world.buildBase();world.setCamera();world.scene.updateMatrixWorld(true);return world;
}

test('base picking tracks its actual 3D solid geometry across camera rotations',()=>{
  const world=fixture();
  for(let turn=0;turn<8;turn++){
    const center=world.project(500,360,44);
    assert.equal(world.pickBase(center.x,center.y),true,`rotation ${turn}`);
    const field=world.project(820,590,0);assert.equal(world.pickBase(field.x,field.y),false);
    world.rotate();
  }
});

test('selection outline and beam do not add invisible clickable areas above the beacon',()=>{
  const world=fixture();world.baseOutline.visible=true;
  const highBeam=world.project(500,360,230);assert.equal(world.pickBase(highBeam.x,highBeam.y),false);
  assert.equal(world.baseOutline.children.length,world.baseHitMeshes.length);
  assert.ok(world.baseOutline.children.every(edge=>edge.isLineSegments&&edge.material.depthTest===false));
  world.setBaseLevel(5);assert.equal(world.baseTierMarkers.filter(m=>m.visible).length,4);
  world.setBaseLevel(1);assert.equal(world.baseTierMarkers.filter(m=>m.visible).length,0);
});

test('a visible ball in front of the beacon is draggable while an occluded ball does not steal the beacon click',()=>{
  const world=fixture(),point=world.project(500,360,44),ball={id:123,type:'cue'};
  world.pickBase(point.x,point.y);
  const hit=world.raycaster.intersectObjects(world.baseHitMeshes,false)[0];
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(8,8,8),new THREE.MeshBasicMaterial());world.scene.add(mesh);world.meshes.set('ball:123',mesh);
  mesh.position.copy(world.raycaster.ray.at(hit.distance-30,new THREE.Vector3()));mesh.updateMatrixWorld(true);
  assert.equal(world.pickBase(point.x,point.y,[ball]),false);
  mesh.position.copy(world.raycaster.ray.at(hit.distance+100,new THREE.Vector3()));mesh.updateMatrixWorld(true);
  assert.equal(world.pickBase(point.x,point.y,[ball]),true);
});
