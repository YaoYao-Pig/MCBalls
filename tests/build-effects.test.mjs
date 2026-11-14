import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { BuildEffects } from '../src/build-effects.js';

const scene = extra => ({phase:'playing',balls:[],enemies:[],beams:[],...extra});
const beam = extra => ({id:1,life:.35,maxLife:.35,width:6,color:'#cda1ff',segments:[{from:{x:100,y:200},to:{x:300,y:200}}],...extra});

test('beam instances follow simulation endpoints in world space without changing the state',t=>{
  const fx=new BuildEffects();t.after(()=>fx.dispose());const state=scene({beams:[beam()]});const copy=structuredClone(state);
  fx.update(state,1,0);
  assert.equal(fx.beams.count,1);assert.equal(fx.halos.count,1);assert.equal(fx.joints.count,1);
  const matrix=new THREE.Matrix4();fx.beams.getMatrixAt(0,matrix);
  const a=new THREE.Vector3(0,-.5,0).applyMatrix4(matrix),b=new THREE.Vector3(0,.5,0).applyMatrix4(matrix);
  assert.ok(a.distanceTo(new THREE.Vector3(-400,22,-160))<1e-4);assert.ok(b.distanceTo(new THREE.Vector3(-200,22,-160))<1e-4);
  assert.deepEqual(state,copy);
});

test('visual beam batches reject malformed geometry and cap a crowded reflection chain',t=>{
  const fx=new BuildEffects();t.after(()=>fx.dispose());
  fx.update(scene({beams:[beam({segments:[{from:{x:NaN,y:1},to:{x:20,y:3}},{from:{x:1,y:1},to:{x:1,y:1}}]})]}),0,0);
  assert.equal(fx.beams.count,0);
  fx.update(scene({beams:Array.from({length:500},(_,id)=>beam({id}))}),0,0);
  assert.equal(fx.beams.count,192);assert.ok([...fx.beams.instanceMatrix.array].every(Number.isFinite));
});

test('fire, frostbite and gravity remain visible together and expired statuses leave no meshes',t=>{
  const fx=new BuildEffects();t.after(()=>fx.dispose());
  const enemy={id:7,hp:100,x:400,y:200,r:18,burnTimer:4,frostTimer:3,frostStacks:2,gravityTimer:2};
  fx.update(scene({enemies:[enemy]}),.4,0);
  assert.equal(fx.flames.count,3);assert.equal(fx.ice.count,1);assert.equal(fx.marks.count,1);
  fx.update(scene({enemies:[{...enemy,burnTimer:0,frostTimer:0,gravityTimer:0}]}),.4,0);
  assert.equal(fx.flames.count+fx.ice.count+fx.marks.count,0);
});

test('build bursts use simulation time, stay bounded and clear on a new stage',t=>{
  const fx=new BuildEffects();t.after(()=>fx.dispose());
  for(let i=0;i<500;i++)fx.emit({type:'buildEffect',effect:'quake',x:300,y:300,radius:120});
  assert.equal(fx.effects.length,128);fx.update(scene(),0,0);
  assert.equal(fx.rings.count,128);assert.equal(fx.shards.count,256);
  fx.update(scene({phase:'paused'}),1,0);assert.equal(fx.effects.length,128);
  fx.update(scene(),2,.7);assert.equal(fx.effects.length,0);assert.equal(fx.rings.count,0);
  fx.emit({type:'buildEffect',effect:'frostBurst',x:300,y:300});fx.update(scene({phase:'transition'}),3,0);
  assert.equal(fx.effects.length,0);assert.equal(fx.cracks.geometry.drawRange.count,0);
});

test('turret anchors and charge appear only for the relevant persistent block',t=>{
  const fx=new BuildEffects();t.after(()=>fx.dispose());
  const ball={id:1,type:'cue',x:250,y:400,r:12,enchantments:{stationary_turret:1}};
  fx.update(scene({balls:[ball,{...ball,id:2,type:'ghost'}]}),1,.02,{down:true,mode:'beam',ballId:1,charge:.5});
  assert.equal(fx.anchors.count,1);assert.equal(fx.charge.count,1);
  fx.update(scene({balls:[ball]}),1,0,{down:false});assert.equal(fx.charge.count,0);
  fx.reset();assert.equal(fx.anchors.count,0);
});

test('chain lightning arcs use the same world-space renderer and expire with simulation time',t=>{
  const fx=new BuildEffects();t.after(()=>fx.dispose());
  for(let i=0;i<200;i++)fx.emit({type:'lightning',from:{x:200,y:200},to:{x:260,y:230}});
  fx.update(scene(),0,0);assert.equal(fx.arcs.length,64);assert.equal(fx.beams.count,128);
  fx.update(scene(),0,.21);assert.equal(fx.arcs.length,0);assert.equal(fx.beams.count,0);
});
