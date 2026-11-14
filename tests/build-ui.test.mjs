import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { BuildPanel } from '../src/build-ui.js';
import { Game } from '../src/core.js';

const initial=()=>({ballId:7,ballName:'寒冰方块',rodId:'wood',rodName:'木棍',mode:'ball',summary:'火焰与冰霜可以同时生效。',effects:[
  {id:'fire_aspect',name:'传染火',level:3,active:true,source:'本局强化 / 球杆',description:'火焰命中并向近邻传播。'},
  {id:'frost_touch',name:'三击碎冰',level:2,active:true,source:'方块 / 临时继承',description:'冰霜叠满后碎冰。'},
  {id:'prism',name:'棱镜',level:0,active:false,source:'',description:'尚未获得。'},
],combos:[{id:'fire_frost',name:'霜火协同',description:'两种状态同时保留。',active:true},{id:'prism_beam',name:'棱镜光束',description:'尚未成型。',active:false}]});

function fixture(t,{expanded=false}={}){
  const window=new Window({settings:{enableJavaScriptEvaluation:false,disableJavaScriptFileLoading:true,enableImageFileLoading:false,enableCSSFileLoading:false}});
  const container=window.document.createElement('div');container.id='build-panel';window.document.body.append(container);
  let data=initial();const calls=[],toggles=[];const game={getBuildInfo:id=>{calls.push(id);return structuredClone(data);}};
  const panel=new BuildPanel(game,{container,expanded,onToggle:value=>toggles.push(value)});
  t.after(async()=>{panel.dispose();await window.happyDOM.close();});
  return{window,container,panel,calls,toggles,set:value=>{data=value;},data:()=>data,query:selector=>container.querySelector(selector)};
}

test('build panel reads the selected ball and only lists owned effects and formed combos',t=>{
  const f=fixture(t),before=structuredClone(f.data());f.panel.update(7);
  assert.deepEqual(f.calls,[7]);assert.deepEqual(f.data(),before);assert.equal(f.container.hidden,false);
  assert.equal(f.query('.build-body').hidden,true);assert.equal(f.query('[data-build-toggle]').getAttribute('aria-expanded'),'false');
  assert.equal(f.container.querySelectorAll('[data-build-effect]').length,2);assert.equal(f.container.querySelectorAll('[data-build-combo]').length,1);
  assert.equal(f.query('[data-build-effect="prism"]'),null);assert.equal(f.query('[data-build-combo="prism_beam"]'),null);
  assert.match(f.query('.build-combo-count').textContent,/1 组合/);
});

test('effective levels, source text and descriptions come from the public API unchanged',t=>{
  const f=fixture(t);const data=f.data();data.effects[0].level=9;data.effects[0].source='核心返回的生效来源';data.effects[0].description='测试倍率 ×1.37';f.panel.update(7);
  const effect=f.query('[data-build-effect="fire_aspect"]');assert.equal(effect.querySelector('.build-effect-level').textContent,'Lv.9');assert.equal(effect.querySelector('.build-effect-source').textContent,'核心返回的生效来源');assert.equal(effect.querySelector('p').textContent,'测试倍率 ×1.37');
});

test('repeated updates preserve focused toggle and existing keyed effect nodes',t=>{
  const f=fixture(t);f.panel.update(7);const toggle=f.query('[data-build-toggle]'),effect=f.query('[data-build-effect="fire_aspect"]');toggle.focus();
  for(let i=0;i<12;i++){f.data().effects[0].level=i+1;f.panel.update(7);}
  assert.equal(f.query('[data-build-toggle]'),toggle);assert.equal(f.query('[data-build-effect="fire_aspect"]'),effect);assert.equal(f.window.document.activeElement,toggle);assert.equal(f.calls.length,13);
});

test('showing a new block removes expired inheritance and updates snapshot rod without stale combinations',t=>{
  const f=fixture(t);f.panel.update(7);f.set({ballId:8,ballName:'铁方块',rodId:'bone',rodName:'骨头',mode:'ball',summary:'普通重击',effects:[{id:'iron',name:'铁质重击',level:1,active:true,source:'方块',description:'重击。'}],combos:[]});f.panel.update(8);
  assert.equal(f.query('[data-build-effect="fire_aspect"]'),null);assert.equal(f.query('[data-build-combo="fire_frost"]'),null);assert.match(f.query('.build-rod-name').textContent,/骨头/);assert.equal(f.query('.build-ball-name').textContent,'铁方块');assert.equal(f.query('.build-combo-count').textContent,'构筑');assert.equal(f.query('.build-empty').hidden,false);
});

test('collapse and Escape preserve data and do not invoke gameplay mutations',t=>{
  const f=fixture(t);f.panel.update(7);const toggle=f.query('[data-build-toggle]');toggle.click();assert.equal(f.query('.build-body').hidden,false);
  f.container.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(f.query('.build-body').hidden,true);assert.equal(f.window.document.activeElement,toggle);assert.deepEqual(f.toggles,[true,false]);assert.equal(f.calls.length,1);assert.equal(f.query('[data-build-effect="fire_aspect"]').textContent.includes('传染火'),true);
});

test('hidden UI skips API reads and retains the chosen expanded state',t=>{
  const f=fixture(t,{expanded:true});f.panel.update(7);f.panel.update(7,{visible:false});assert.equal(f.container.hidden,true);assert.equal(f.calls.length,1);f.panel.update(7);assert.equal(f.container.hidden,false);assert.equal(f.query('.build-body').hidden,false);
});

test('null selection clears real effects and never advertises a completed build',t=>{
  const f=fixture(t);f.panel.update(7);f.set({ballId:null,effects:initial().effects,combos:initial().combos});f.panel.update(null);
  assert.equal(f.container.querySelectorAll('[data-build-effect]').length,0);assert.equal(f.container.querySelectorAll('[data-build-combo]').length,0);assert.equal(f.query('.build-ball-name').textContent,'未选择方块');assert.equal(f.query('.build-rod-icon').hidden,true);
});

test('API text is rendered as text, not interpreted as HTML',t=>{
  const f=fixture(t);f.data().ballName='<img src=x onerror=alert(1)>';f.data().effects[0].description='<script>bad()</script>';f.panel.update(7);
  assert.equal(f.query('script'),null);assert.equal(f.query('.build-ball-name').childElementCount,0);assert.equal(f.query('[data-build-effect="fire_aspect"] p').textContent,'<script>bad()</script>');
});

test('beam mode reads the actual mode and uses bundled local item icons',t=>{
  const f=fixture(t);f.data().mode='beam';f.data().rodId='end';f.panel.update(7);assert.equal(f.query('.build-mode').textContent,'蓄力光束');assert.match(f.query('.build-rod-icon').src,/assets\/minecraft\/end-rod\.png$/);
  for(const image of f.container.querySelectorAll('img'))assert.match(image.src,/assets\/minecraft\/[a-z-]+\.png$/);
});

test('slime inherited trait has the block icon and keeps its actual source description',t=>{
  const f=fixture(t);f.data().effects=[{id:'slime',name:'粘液弹性',level:1,active:true,source:'临时继承',description:'继承粘液方块的弹性。'}];f.data().combos=[];f.panel.update(7);
  const effect=f.query('[data-build-effect="slime"]');assert.ok(effect);assert.match(effect.querySelector('img').src,/assets\/minecraft\/slime-block\.png$/);assert.equal(effect.querySelector('.build-effect-source').textContent,'临时继承');
});

test('reordering effects retains their DOM identity and deduplicates malformed duplicate IDs',t=>{
  const f=fixture(t);f.panel.update(7);const fire=f.query('[data-build-effect="fire_aspect"]');f.data().effects.reverse();f.data().effects.push(f.data().effects.find(item=>item.id==='fire_aspect'));f.panel.update(7);
  assert.equal(f.query('[data-build-effect="fire_aspect"]'),fire);assert.equal(f.container.querySelectorAll('[data-build-effect]').length,2);assert.equal(f.query('[data-build-effects]').firstElementChild.dataset.buildEffect,'frost_touch');
});

test('reset clears stale content and dispose stops later updates or clicks',t=>{
  const f=fixture(t);f.panel.update(7);f.panel.setExpanded(true);f.panel.reset();assert.equal(f.container.hidden,true);assert.equal(f.query('.build-body').hidden,true);assert.equal(f.container.querySelectorAll('[data-build-effect]').length,0);
  f.panel.dispose();const before=f.calls.length;f.query('[data-build-toggle]').click();f.panel.update(7);assert.equal(f.calls.length,before);assert.equal(f.container.hidden,true);
});

test('real Game build API supplies stacked upgrade, rod and block levels plus formed combos',t=>{
  const f=fixture(t),game=new Game({random:()=>.5});game.start();const ball=game.state.balls[0];
  game.state.upgrades.fire_aspect=1;game.state.rodEnchantments.wood={fire_aspect:1};ball.enchantments={fire_aspect:1};ball.traits=['frost'];
  f.panel.game=game;const before=structuredClone(game.state),info=f.panel.update(ball.id),effect=info.effects.find(item=>item.id==='fire_aspect');
  assert.equal(effect.level,3);assert.equal(f.query('[data-build-effect="fire_aspect"] .build-effect-level').textContent,`Lv.${effect.level}`);
  assert.equal(f.query('[data-build-effect="fire_aspect"] .build-effect-source').textContent,effect.source);assert.match(effect.source,/本局强化/);assert.match(effect.source,/球杆/);assert.match(effect.source,/方块/);
  assert.ok(f.query('[data-build-combo="fire_frost"]'));assert.deepEqual(game.state,before);
});

test('real moving block keeps the shot rod in its build panel until it is held again',t=>{
  const f=fixture(t),game=new Game({random:()=>.5});game.start();const ball=game.state.balls[0];
  game.state.ownedRods.push('bone');game.state.rodEnchantments.wood={fire_aspect:1};assert.equal(game.shoot(0,1,ball.id),true);assert.equal(game.equipRod('bone'),true);
  f.panel.game=game;f.panel.update(ball.id);assert.match(f.query('.build-rod-name').textContent,/木棍/);assert.ok(f.query('[data-build-effect="fire_aspect"]'));
  assert.equal(game.beginAim(ball.id),true);f.panel.update(ball.id);assert.match(f.query('.build-rod-name').textContent,/骨头/);assert.equal(f.query('[data-build-effect="fire_aspect"]'),null);
});
