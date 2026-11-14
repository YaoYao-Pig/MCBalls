import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Game } from '../src/core.js';
import { UpgradeTargetPanel } from '../src/upgrade-target-ui.js';

function fixture(t){
  const window=new Window({settings:{enableJavaScriptEvaluation:false,enableCSSFileLoading:false,enableImageFileLoading:false}});
  const container=window.document.createElement('div');window.document.body.append(container);
  const game=new Game({random:()=>.55});game.start();game._spawnTimer=Infinity;
  const cue=game.state.balls[0],red=game._spawnTraitBall('storm');
  game.state.phase='upgrade';game.state.pendingUpgrades=1;game.state.choices=['stationary_turret','power','echo'];game._offeredUpgrades=[...game.state.choices];
  const selected=[],notices=[];let cancelled=0;
  const panel=new UpgradeTargetPanel(game,{container,onSelected:id=>selected.push(id),notify:msg=>notices.push(msg),onCancel:()=>cancelled++});
  t.after(()=>window.happyDOM.close());
  const enter=()=>{assert.equal(game.chooseUpgrade('stationary_turret'),true);panel.update();};
  return {window,container,game,cue,red,panel,selected,notices,enter,cancelled:()=>cancelled,card:id=>container.querySelector(`[data-ball-id="${id}"]`)};
}

test('opening the real target panel holds the upgrade and confirms only the chosen redstone block',t=>{
  const f=fixture(t);f.enter();
  assert.equal(f.container.hidden,false);assert.equal(f.game.state.phase,'upgrade');assert.equal(f.game.state.pendingUpgrades,1);
  assert.equal(f.cue.enchantments.stationary_turret,undefined);assert.equal(f.red.enchantments.stationary_turret,undefined);
  assert.deepEqual(f.panel.eligibleIds,[f.cue.id,f.red.id]);
  f.card(f.red.id).click();
  assert.equal(f.red.enchantments.stationary_turret,1);assert.equal(f.cue.enchantments.stationary_turret,undefined);
  assert.equal(f.game.state.pendingUpgrades,0);assert.equal(f.container.hidden,true);assert.deepEqual(f.selected,[f.red.id]);
  f.card(f.red.id).click();assert.equal(f.red.enchantments.stationary_turret,1);assert.deepEqual(f.selected,[f.red.id]);
});

test('Escape returns to the same choice without spending or randomly rerolling',t=>{
  const f=fixture(t),choices=[...f.game.state.choices];f.enter();
  const event=new f.window.KeyboardEvent('keydown',{key:'Escape',cancelable:true});assert.equal(f.panel.handleKey(event),true);
  assert.equal(event.defaultPrevented,true);assert.equal(f.cancelled(),1);assert.equal(f.game.state.upgradeTarget,null);
  assert.equal(f.game.state.pendingUpgrades,1);assert.deepEqual(f.game.state.choices,choices);assert.equal(f.container.hidden,true);
  assert.equal(f.panel.handleKey(new f.window.KeyboardEvent('keydown',{key:'2'})),false);
});

test('a full main block remains unavailable while the player can select a different block',t=>{
  const f=fixture(t);f.cue.enchantments={power:1,crit:1,fire_aspect:1,frost_touch:1};f.enter();
  assert.equal(f.card(f.cue.id).disabled,true);assert.equal(f.card(f.red.id).disabled,false);assert.match(f.card(f.cue.id).textContent,/满|四/);
  const event=new f.window.KeyboardEvent('keydown',{key:'2',cancelable:true});f.panel.handleKey(event);
  assert.equal(f.red.enchantments.stationary_turret,1);assert.equal(Object.keys(f.cue.enchantments).length,4);
});

test('confirmation revalidates a target that was captured after the panel drew it',t=>{
  const f=fixture(t);f.enter();const button=f.card(f.red.id);assert.equal(button.disabled,false);
  f.red.heldBy=99;button.click();
  assert.equal(f.game.state.pendingUpgrades,1);assert.equal(f.red.enchantments.stationary_turret,undefined);
  assert.ok(f.notices.length>0);assert.equal(f.selected.length,0);assert.equal(f.container.hidden,false);
});

test('refresh preserves focused target buttons and cancellation remains available when targets disappear',t=>{
  const f=fixture(t);f.enter();const button=f.card(f.red.id);button.focus();
  for(let i=0;i<10;i++)f.panel.update();assert.equal(f.card(f.red.id),button);assert.equal(f.window.document.activeElement,button);
  f.game.state.balls=[];f.panel.update();assert.equal(f.panel.eligibleIds.length,0);assert.equal(f.panel.empty.hidden,false);
  f.panel.back.click();assert.equal(f.cancelled(),1);assert.equal(f.game.state.pendingUpgrades,1);
});

test('an existing full-slot turret can be selected for its next rank with an accurate label',t=>{
  const f=fixture(t);f.red.enchantments={stationary_turret:1,power:1,prism:1,fire_aspect:1};f.enter();
  assert.equal(f.card(f.red.id).disabled,false);assert.match(f.card(f.red.id).textContent,/1 → 2/);
  f.card(f.red.id).click();assert.equal(f.red.enchantments.stationary_turret,2);assert.equal(Object.keys(f.red.enchantments).length,4);
});
