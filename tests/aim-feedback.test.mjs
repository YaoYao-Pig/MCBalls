import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { AimFeedback } from '../src/aim-feedback.js';

const css=await readFile(new URL('../src/aim-feedback.css',import.meta.url),'utf8');
function clock(){
  let id=0;const pending=new Map(),scheduled=[];
  return{now:0,pending,scheduled,schedule(fn,delay){const entry={id:id++,fn,at:this.now+delay};pending.set(entry.id,entry);scheduled.push(entry);return entry.id;},cancel(id){pending.delete(id);},tick(ms){this.now+=ms;for(const entry of [...pending.values()].sort((a,b)=>a.at-b.at)){if(entry.at<=this.now&&pending.delete(entry.id))entry.fn();}}};
}
function event(overrides={}){return{type:'catch',ballId:7,x:500,y:400,caughtSpeed:600,damageBonus:.25,speedBonus:.05,streak:2,grade:'swift',precise:true,timeScale:.3,pending:true,...overrides};}
function fixture(t,options={}){
  const window=new Window({settings:{enableJavaScriptEvaluation:false,enableCSSFileLoading:false,enableImageFileLoading:false}});
  window.document.write('<section id="arena"><div id="aim-feedback" hidden></div><div id="slow-time-status" hidden></div></section>');
  const style=window.document.createElement('style');style.textContent=css;window.document.head.append(style);
  const container=window.document.getElementById('aim-feedback'),statusContainer=window.document.getElementById('slow-time-status'),time=clock();
  let randomCalls=0;
  const feedback=new AimFeedback({container,statusContainer,reducedMotion:false,random:()=>{randomCalls++;return .5;},now:()=>time.now,schedule:(fn,delay)=>time.schedule(fn,delay),cancel:id=>time.cancel(id),...options});
  t.after(async()=>{feedback.dispose();await window.happyDOM.close();});
  return{window,container,statusContainer,time,feedback,randomCalls:()=>randomCalls,get:selector=>window.document.querySelector(selector)};
}

test('initial and unrelated events do not fabricate a catch or start timers',t=>{
  const f=fixture(t);assert.equal(f.container.hidden,true);assert.equal(f.statusContainer.hidden,true);
  assert.equal(f.feedback.showCatch(event({type:'hit'})),false);assert.equal(f.feedback.showCatch(event({caughtSpeed:0})),false);
  assert.equal(f.container.textContent,'');assert.equal(f.randomCalls(),0);assert.equal(f.time.pending.size,0);
});

test('catch presentation uses the supplied speed, damage, velocity bonus, grade and streak',t=>{
  const f=fixture(t);assert.equal(f.feedback.showCatch(event()),true);
  assert.equal(f.container.hidden,false);assert.equal(f.container.dataset.grade,'swift');assert.equal(f.container.dataset.precise,'true');
  assert.equal(f.get('[data-catch-speed]').textContent,'接速 600');
  assert.equal(f.get('[data-catch-damage]').textContent,'下一击增伤 +25%');
  assert.equal(f.get('[data-catch-velocity-bonus]').textContent,'出速 +5%');assert.equal(f.get('[data-catch-streak]').textContent,'连段 2');
  assert.equal(f.time.pending.size,1);
});

test('random phrase choice is bounded even for invalid random providers',t=>{
  let random=0;const f=fixture(t,{random:()=>random});
  for(const value of [-100,0,.5,.99999,1,100,NaN,Infinity,-Infinity]){
    random=value;assert.equal(f.feedback.showCatch(event({grade:'moving'})),true);
    assert.ok(['精巧接球','漂亮截击','灵巧回接'].includes(f.get('[data-catch-title]').textContent));assert.equal(f.time.pending.size,1);
  }
});

test('frame updates neither reroll wording nor create or extend catch timers',t=>{
  const f=fixture(t),caught=event();f.feedback.showCatch(caught);const title=f.get('[data-catch-title]').textContent;
  for(let i=0;i<120;i++)f.feedback.update({...caught,active:true},{visible:true});
  assert.equal(f.get('[data-catch-title]').textContent,title);assert.equal(f.randomCalls(),1);assert.equal(f.time.scheduled.length,1);assert.equal(f.time.pending.size,1);
  assert.equal(f.get('[data-time-scale]').textContent,'×0.30');
  f.feedback.update({...caught,active:true,timeScale:.15});assert.equal(f.get('[data-time-scale]').textContent,'×0.15');
  assert.equal(f.get('[role="progressbar"]').getAttribute('aria-valuenow'),'15');
});

test('the same catch event object is not played twice',t=>{
  const f=fixture(t),caught=event();assert.equal(f.feedback.showCatch(caught),true);assert.equal(f.feedback.showCatch(caught),false);
  assert.equal(f.randomCalls(),1);assert.equal(f.time.scheduled.length,1);
});

test('a new valid catch replaces the one timeout and a stale callback cannot hide it',t=>{
  const f=fixture(t);f.feedback.showCatch(event());const old=f.time.scheduled[0];
  f.time.tick(500);f.feedback.showCatch(event({ballId:8,caughtSpeed:900,grade:'perfect',damageBonus:.6,speedBonus:.12,streak:3}));
  assert.equal(f.time.pending.size,1);old.fn();assert.equal(f.container.hidden,false);
  assert.equal(f.get('[data-catch-damage]').textContent,'下一击增伤 +60%');
  f.time.tick(999);assert.equal(f.container.hidden,false);f.time.tick(1);assert.equal(f.container.hidden,true);assert.equal(f.time.pending.size,0);
});

test('inactive aiming hides slow time while the catch popup finishes its one-second life',t=>{
  const f=fixture(t),caught=event();f.feedback.showCatch(caught);f.feedback.update({...caught,active:true});
  f.feedback.update({active:false,timeScale:1});assert.equal(f.statusContainer.hidden,true);assert.equal(f.container.hidden,false);
  f.time.tick(1000);assert.equal(f.container.hidden,true);
});

test('hidden gameplay resets all text and timers and does not replay catch on restore',t=>{
  const f=fixture(t),caught=event();f.feedback.showCatch(caught);f.feedback.update({...caught,active:true});
  f.feedback.update({...caught,active:true},{visible:false});
  assert.equal(f.container.hidden,true);assert.equal(f.statusContainer.hidden,true);assert.equal(f.container.textContent,'');assert.equal(f.time.pending.size,0);
  assert.equal(f.container.dataset.grade,undefined);f.feedback.update({...caught,active:true},{visible:true});assert.equal(f.container.hidden,true);assert.equal(f.randomCalls(),1);
});

test('cancel/reset clears the pending reward immediately',t=>{
  const f=fixture(t);f.feedback.showCatch(event());f.feedback.reset();
  assert.equal(f.container.hidden,true);assert.equal(f.container.textContent,'');assert.equal(f.statusContainer.hidden,true);assert.equal(f.time.pending.size,0);
  f.time.tick(2000);assert.equal(f.container.hidden,true);
});

test('invalid numeric reward fields are rejected rather than replaced with invented values',t=>{
  const f=fixture(t);
  for(const overrides of [{caughtSpeed:NaN},{caughtSpeed:-5},{damageBonus:undefined},{damageBonus:-1},{speedBonus:Infinity},{streak:1.5},{streak:0},{grade:'unknown'},{ballId:null}])assert.equal(f.feedback.showCatch(event(overrides)),false);
  assert.equal(f.container.hidden,true);assert.equal(f.randomCalls(),0);assert.equal(f.time.pending.size,0);
  f.feedback.update({active:true,timeScale:undefined});assert.equal(f.statusContainer.hidden,true);
  f.feedback.update({active:true,timeScale:NaN});assert.equal(f.statusContainer.hidden,true);
});

test('an actual catchShot changes context without a second popup or extra random choice',t=>{
  const f=fixture(t);assert.equal(f.feedback.showCatch(event({type:'catchShot',pending:false})),false);
  f.feedback.showCatch(event());f.time.tick(400);
  assert.equal(f.feedback.showCatch(event({type:'catchShot',ballId:99,pending:false})),false);
  assert.equal(f.feedback.showCatch(event({type:'catchShot',pending:false})),true);
  assert.equal(f.get('[data-catch-damage]').textContent,'本杆增伤 +25%');assert.equal(f.container.dataset.pending,'false');assert.equal(f.randomCalls(),1);assert.equal(f.time.scheduled.length,1);
  f.time.tick(600);assert.equal(f.container.hidden,true);
});

test('update expires a popup whose browser timeout was throttled',t=>{
  const f=fixture(t);f.feedback.showCatch(event());f.time.now=1500;f.feedback.update({active:false,timeScale:1});
  assert.equal(f.container.hidden,true);assert.equal(f.time.pending.size,0);
});

test('reduced-motion feedback and both overlays preserve pointer interaction',t=>{
  const f=fixture(t,{reducedMotion:true});f.feedback.showCatch(event());
  assert.equal(f.container.dataset.reducedMotion,'true');assert.equal(f.window.getComputedStyle(f.container).pointerEvents,'none');assert.equal(f.window.getComputedStyle(f.statusContainer).pointerEvents,'none');
  assert.equal(f.window.getComputedStyle(f.container).animation,'none');
});

test('a popup can avoid a top-center aim point without chasing it every frame',t=>{
  const f=fixture(t),arena=f.get('#arena');arena.getBoundingClientRect=()=>({width:500,height:350});
  Object.defineProperty(f.container,'offsetWidth',{value:200});Object.defineProperty(f.container,'offsetHeight',{value:65});
  f.feedback.showCatch(event());f.feedback.update({active:true,timeScale:.3},{avoidPoint:{x:240,y:30}});
  assert.equal(f.container.dataset.side,'right');f.feedback.update({active:true,timeScale:.3},{avoidPoint:{x:450,y:20}});assert.equal(f.container.dataset.side,'right');
});

test('dispose is idempotent and cannot leave a scheduled popup behind',t=>{
  const f=fixture(t);f.feedback.showCatch(event());f.feedback.dispose();f.feedback.dispose();
  assert.equal(f.time.pending.size,0);assert.equal(f.feedback.showCatch(event()),false);f.feedback.update({active:true,timeScale:.3});assert.equal(f.statusContainer.hidden,true);
});
