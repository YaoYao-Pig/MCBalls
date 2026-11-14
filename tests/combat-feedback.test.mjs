import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatFeedback, damageStyle } from '../src/combat-feedback.js';

test('enemy combo scales impact lettering while mining and shield feedback stay distinct',()=>{
  const normal=damageStyle({target:'enemy',combo:1}),chain=damageStyle({target:'enemy',combo:12}),high=damageStyle({target:'enemy',combo:40,crit:true});
  assert.ok(normal.size<chain.size&&chain.size<high.size);
  assert.equal(chain.flames,true);assert.equal(high.label,'暴击');
  assert.equal(damageStyle({target:'resource',combo:80,crit:true}).size,13);
  assert.equal(damageStyle({target:'resource',combo:80}).flames,false);
  assert.equal(damageStyle({target:'enemy',combo:40,shield:true}).flames,false);
});

test('damage numbers snapshot combo metadata and expire without retaining previous battle state',()=>{
  const fx=new CombatFeedback({random:()=>.5});
  const event={target:'enemy',x:20,y:30,value:44,combo:12,burning:true};fx.impact(event);event.combo=0;
  assert.equal(fx.texts[0].combo,12);assert.equal(fx.texts[0].value,44);
  fx.update(2);assert.equal(fx.texts.length,0);assert.equal(fx.sparks.length,0);assert.equal(fx.flashes.length,0);
  fx.impact({...event,combo:50});fx.reset();assert.equal(fx.hitStop,0);assert.equal(fx.texts.length,0);assert.deepEqual(fx.offset(),{x:0,y:0});
});

test('a burst of hits cannot stack unlimited pauses or effect objects',()=>{
  const fx=new CombatFeedback({random:()=>.4});
  for(let i=0;i<1000;i++)fx.impact({target:'enemy',x:20,y:30,value:70,combo:100,crit:true});
  assert.ok(fx.hitStop<=.055);assert.ok(fx.texts.length<=32);assert.ok(fx.sparks.length<=220);assert.ok(fx.flashes.length<=24);
  assert.ok(fx.consumeHitStop(.06)>=.005-1e-8);assert.equal(fx.consumeHitStop(.016),.016);
  fx.update(.02);fx.impact({target:'enemy',x:20,y:30,value:70,combo:100,crit:true});assert.equal(fx.hitStop,0,'contact spam during cooldown must not freeze another frame');
});

test('reduced motion retains readable damage scaling without camera shake or hit stop',()=>{
  const fx=new CombatFeedback({reducedMotion:true});fx.impact({target:'enemy',x:20,y:30,value:44,combo:50,crit:true});
  assert.equal(fx.hitStop,0);assert.equal(fx.texts[0].tilt,0);assert.deepEqual(fx.offset(),{x:0,y:0});assert.ok(fx.texts[0].size>25);
  fx.burst(10,10,'#fff',3);assert.equal(fx.shake,0);
});

test('mining never invokes the combat freeze even when the run has a high combo',()=>{
  const fx=new CombatFeedback();fx.impact({target:'resource',x:20,y:30,value:2,combo:80,material:'obsidian'});
  assert.equal(fx.hitStop,0);assert.equal(fx.shake,0);assert.equal(fx.texts[0].combo,0);
});
