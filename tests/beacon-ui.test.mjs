import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/core.js';
import { BeaconPanel } from '../src/beacon-ui.js';

function fixture(t){
  const window=new Window({settings:{enableJavaScriptEvaluation:false,disableJavaScriptFileLoading:true,enableImageFileLoading:false,enableCSSFileLoading:false}});
  window.document.write('<div id="beacon-content"></div>');
  const previous=globalThis.document;globalThis.document=window.document;
  t.after(async()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;await window.happyDOM.close();});
  const game=new Game({random:()=>.8});game.start();game.togglePause();
  for(const id of Object.keys(game.state.materials))game.state.materials[id]=10000;
  const actions=[],selections=[],notices=[];
  const panel=new BeaconPanel(game,{notify:message=>notices.push(message),onAction:action=>actions.push(action),onSelect:selection=>selections.push(selection)});
  panel.show();
  const query=selector=>window.document.querySelector(selector);
  const choose=id=>{const node=query(`[data-beacon-upgrade="${id}"]`);assert.ok(node,`Missing ${id}`);node.click();return node;};
  const role=id=>query(`[data-worker-role="${id}"]`).click();
  const workerUpgrade=id=>query(`[data-worker-upgrade="${id}"]`).click();
  const raiseTo=level=>{while(game.getBeaconInfo().level<level)assert.equal(game.upgradeBeacon('level'),true);panel.refresh(true);};
  return{window,game,panel,actions,selections,notices,query,choose,role,workerUpgrade,raiseTo};
}

test('beacon builds all API options from one container and opening never spends resources',t=>{
  const f=fixture(t),before=structuredClone(f.game.state);
  f.panel.show();f.panel.refresh(true);
  assert.deepEqual(f.game.state,before);
  assert.equal(f.query('[data-beacon-tab="beacon"]').getAttribute('aria-selected'),'true');
  assert.equal(f.window.document.querySelectorAll('[data-beacon-upgrade]').length,f.game.getBeaconInfo().upgrades.length+1);
  assert.equal(f.window.document.querySelectorAll('.beacon-pyramid-tier.built').length,f.game.getBeaconInfo().pyramidLayers);
  assert.equal(f.actions.length,0);
});

test('unavailable abilities remain inspectable and show the Game gate without allowing purchase',t=>{
  const f=fixture(t),item=f.game.getBeaconInfo().upgrades.find(item=>item.locked);
  assert.ok(item,'There should be a gated ability at level 1');
  const before=structuredClone(f.game.state),node=f.choose(item.id);
  assert.equal(node.disabled,false);
  assert.equal(f.query('[data-beacon-confirm]').disabled,true);
  assert.equal(f.query('.beacon-reason').textContent,f.game.canUpgradeBeacon(item.id).reason);
  f.query('[data-beacon-confirm]').click();
  assert.deepEqual(f.game.state,before);assert.equal(f.actions.length,0);
});

test('beacon level confirmation charges the API cost once and refreshes HP and pyramid layers',t=>{
  const f=fixture(t),before=structuredClone(f.game.state.materials),check=f.game.canUpgradeBeacon('level'),old=f.game.getBeaconInfo();
  assert.equal(check.ok,true);f.choose('level');f.query('[data-beacon-confirm]').click();
  const info=f.game.getBeaconInfo();assert.equal(info.level,old.level+1);assert.ok(info.maxHp>old.maxHp);
  for(const [id,value]of Object.entries(before))assert.equal(f.game.state.materials[id],value-(check.cost[id]||0));
  assert.equal(f.window.document.querySelectorAll('.beacon-pyramid-tier.built').length,info.pyramidLayers);
  assert.match(f.query('.beacon-summary').textContent,new RegExp(String(info.maxHp)));
  assert.deepEqual(f.actions.map(action=>action.id),['level']);
});

test('ability buttons and focused selection survive forced inventory and health refreshes',t=>{
  const f=fixture(t),node=f.choose('shield');node.focus();
  const confirm=f.query('[data-beacon-confirm]');
  f.game.state.materials.iron+=3;f.game.state.hp-=1;
  for(let i=0;i<5;i++)f.panel.refresh(i%2===0);
  assert.equal(f.query('[data-beacon-upgrade="shield"]'),node);
  assert.equal(f.query('[data-beacon-confirm]'),confirm);
  assert.equal(f.window.document.activeElement,node);
  assert.equal(node.getAttribute('aria-pressed'),'true');
});

test('click revalidates a formerly affordable upgrade after inventory changes',t=>{
  const f=fixture(t);f.choose('shield');const check=f.game.canUpgradeBeacon('shield');assert.equal(check.ok,true);
  for(const id of Object.keys(check.cost))f.game.state.materials[id]=0;
  const before=structuredClone(f.game.state);f.query('[data-beacon-confirm]').click();
  assert.deepEqual(f.game.state,before);assert.equal(f.actions.length,0);assert.ok(f.notices.length);
  assert.equal(f.query('[data-beacon-confirm]').disabled,true);
});

test('raising beacon levels unlocks a selected gated ability without replacing its button',t=>{
  const f=fixture(t),item=f.game.getBeaconInfo().upgrades.find(item=>item.locked);assert.ok(item);
  const node=f.choose(item.id);f.raiseTo(f.game.getBeaconInfo().maxLevel);
  assert.equal(f.query(`[data-beacon-upgrade="${item.id}"]`),node);
  assert.equal(f.panel.selectedBeacon,item.id);assert.equal(f.game.canUpgradeBeacon(item.id).ok,true);
  assert.equal(f.query('[data-beacon-confirm]').disabled,false);
});

test('worker tabs and role selection only preview; hire confirms the exact transaction',t=>{
  const f=fixture(t),before=structuredClone(f.game.state);f.panel.setTab('workers');f.role('miner');
  assert.deepEqual(f.game.state,before);assert.equal(f.actions.length,0);
  const cost=f.game.canHireWorker('miner').cost,inventory=structuredClone(f.game.state.materials);
  f.query('[data-beacon-confirm]').click();
  assert.equal(f.game.state.workers.filter(worker=>worker.role==='miner'&&worker.hp>0).length,1);
  for(const[id,value]of Object.entries(inventory))assert.equal(f.game.state.materials[id],value-(cost[id]||0));
  assert.deepEqual(f.actions.map(action=>[action.role,action.id]),[['miner','hire']]);
  assert.equal(f.query('.beacon-worker-life strong').textContent,'60 秒');
});

test('worker life updates reuse rows and keep a focused tool button',t=>{
  const f=fixture(t);f.panel.setTab('workers');f.role('lumberjack');f.query('[data-beacon-confirm]').click();f.workerUpgrade('tool');
  const tool=f.query('[data-worker-upgrade="tool"]'),life=f.query('.beacon-worker-life');tool.focus();
  const worker=f.game.state.workers.find(worker=>worker.role==='lumberjack');worker.life=58.2;f.panel.refresh();
  assert.equal(f.query('.beacon-worker-life'),life);assert.equal(f.query('[data-worker-upgrade="tool"]'),tool);assert.equal(f.window.document.activeElement,tool);
  assert.equal(life.querySelector('strong').textContent,'59 秒');
});

test('the worker tool is upgraded separately from the player pickaxe and the other profession',t=>{
  const f=fixture(t);f.panel.setTab('workers');f.role('miner');f.workerUpgrade('tool');
  const playerTool=f.game.state.pickaxe,previous=f.game.getWorkerInfo();f.query('[data-beacon-confirm]').click();
  const current=f.game.getWorkerInfo();
  assert.equal(f.game.state.pickaxe,playerTool);
  assert.equal(current.roles.find(role=>role.role==='miner').stats.toolLevel,previous.roles.find(role=>role.role==='miner').stats.toolLevel+1);
  assert.equal(current.roles.find(role=>role.role==='lumberjack').stats.toolLevel,previous.roles.find(role=>role.role==='lumberjack').stats.toolLevel);
  assert.match(f.query('[data-beacon-confirm]').textContent,/镐/);
});

test('worker capacity and terminal phases disable hire without spending materials',t=>{
  const f=fixture(t);f.panel.setTab('workers');f.role('miner');
  while(f.game.canHireWorker('miner').ok)f.query('[data-beacon-confirm]').click();
  const before=structuredClone(f.game.state.materials);assert.equal(f.query('[data-beacon-confirm]').disabled,true);
  f.query('[data-beacon-confirm]').click();assert.deepEqual(f.game.state.materials,before);
  f.role('lumberjack');
  for(const phase of ['ready','upgrade','transition','won','lost']){f.game.state.phase=phase;f.panel.refresh();assert.equal(f.query('[data-beacon-confirm]').disabled,true);f.query('[data-beacon-confirm]').click();assert.deepEqual(f.game.state.materials,before);}
});

test('tab keyboard navigation updates selected tab and focus without charging resources',t=>{
  const f=fixture(t),before=structuredClone(f.game.state.materials),tab=f.query('[data-beacon-tab="beacon"]');tab.focus();
  tab.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(f.panel.tab,'workers');assert.equal(f.window.document.activeElement,f.query('[data-beacon-tab="workers"]'));
  assert.equal(f.query('[data-beacon-tab="workers"]').getAttribute('aria-selected'),'true');assert.deepEqual(f.game.state.materials,before);
});
