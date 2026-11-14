import { Game, UPGRADES, WORLD, RODS, PICKAXES, describeBall, describeRicochet, describeResource, describeCatch } from './core.js';
import { readSave, writeSave } from './storage.js';
import { WorldRenderer } from './three-renderer.js';
import { WorkbenchPanel } from './workbench-ui.js';
import { CraftingPanel, getMaterialVisual } from './crafting-ui.js';
import { updateRicochetPanel } from './ricochet-ui.js';
import { CombatFeedback } from './combat-feedback.js';
import { GameAudio } from './game-audio.js';
import { BeaconPanel } from './beacon-ui.js';
import { AimFeedback } from './aim-feedback.js';
import { WaveAnnouncement } from './wave-announcement.js';
import { BuildPanel } from './build-ui.js';
import { UpgradeTargetPanel } from './upgrade-target-ui.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const fxCanvas = $('fx-canvas');
const ctx = fxCanvas.getContext('2d');
const world = new WorldRenderer(canvas);
const save = readSave();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const feedback = new CombatFeedback({reducedMotion});
const aimFeedback = new AimFeedback({reducedMotion});
const audio = new GameAudio({muted:save.muted,musicMuted:save.musicMuted});
const arenaShell = canvas.parentElement;
const colors = { cue: '#f5edd6', iron: '#9daeb4', storm: '#e9c970', frost: '#91d9d2', slime:'#b6ed78', ghost: '#b4b8e8' };
const icons = { power: '↗', charge: '»', knockback: '⇢', crit: '✦', echo: '◌', iron: '●', storm: 'ϟ', frost: '❄', ricochet: '◇', repair: '＋' };
const rodNames = ['木棍', '骨头', '末地烛', '烈焰棒'];
const rodTextures = ['stick', 'bone', 'end-rod', 'blaze-rod'];
const categoryNames = { rod: '击球强化', ball: '方块进化', base: '基地强化', supply: '补给' };
const buildHints={slime:'高弹力可传给融合块与幻影；粘液炮台的光束反弹更远。',fire_aspect:'幻影、分叉和光束都可带火；火焰不会清除寒冰。',frost_touch:'寒冰连续命中：缓速 → 冻伤 → 碎冰爆发。',stationary_turret:'幻影增加光束数量；红石让命中连锁引雷。',earthshatter:'震波继承元素；引力聚怪能扩大有效覆盖。',prism:'分叉继承原攻击的元素、附魔和球杆效果。',gravity_mark:'聚怪强化传染、雷链和震波；标记死亡触发塌缩。',echo:'幻影继承元素；炮台模式下增加光束数量。'};
function textureFor(id, next = false) {
  if (id === 'rod' || id === 'equipped-rod') return RODS.find(r=>r.id===game.state.activeRod)?.texture||'stick';
  return { power: 'bone', charge: 'stick', knockback: 'iron', crit: 'diamond', echo: 'end-rod', iron: 'iron', gold:'gold', storm: 'redstone', frost: 'ice', slime:'slime-block', tnt:'tnt-side', ricochet: 'gold', elasticity:'enchanted-book', time_dilation:'end-rod', fire_aspect:'fire-charge', frost_touch:'ice', stationary_turret:'end-crystal', earthshatter:'anvil', prism:'diamond-item', gravity_mark:'ender-pearl', storm_link:'lightning-rod', steam_burst:'blaze-powder', supply_building:'oak-log', supply_iron:'iron-ingot', supply_book:'enchanted-book', repair: 'crafting-top', shield: 'iron', regen: 'grass-top', pulse: 'redstone', cue: 'grass-side', base: 'diamond' }[id] || 'stick';
}
function textureElement(name) {
  const img = document.createElement('img'); img.src = new URL(`../assets/minecraft/${String(name).replaceAll('_','-')}.png`, import.meta.url).href; img.alt = ''; return img;
}
const fx = { particles: [], rings: [], bolts: [], melts: [] };
let lastPhase = '', lastBuild = '', lastWave = 0, lastFrame = 0, visualTime = 0;
let width = 1000, height = 720, scale = 1, offsetX = 0, offsetY = 0;
let aim = { x: 0, y: 0, angle: 0, down: false, charge: 0, pointerId: null, origin: null, ballId: null, distance: 0 };
let hoverId = null, hoverBase = false;
let selectedMode='ball';
let shopOpen = false, craftOpen=false, beaconOpen=false, shopTab='materials', stationOpen = null, modalWasPaused = false, itemMode = null, selectedBallId = null, lastMaterials = '', bossTimer;
const itemInfo={potion:{name:'治疗',texture:'apple'},snowball:{name:'雪球',texture:'snowball',target:true},fire_charge:{name:'火焰弹',texture:'fire-charge',target:true},ender_pearl:{name:'瞬移',texture:'ender-pearl',target:true},redstone_boost:{name:'过载',texture:'redstone'},lightning_rod:{name:'避雷针',texture:'lightning-rod',target:true}};
const materialInfo = { wood: ['木材','oak-log'], stone: ['石料','stone'], iron: ['铁锭','iron-ingot'], bone: ['骨头','bone'], blazeRod: ['烈焰棒','blaze-rod'], gunpowder: ['火药','gunpowder'], endPearl: ['末影珍珠','ender-pearl'], diamond: ['钻石','diamond-item'],obsidian:['黑曜石','obsidian'],blazePowder:['烈焰粉','blaze-powder'],gold:['金锭','gold-ingot'],quartz:['石英','quartz'],netheriteScrap:['合金碎片','netherite-scrap'],slimeBall:['黏液球','slime-ball'] };
let toastTimer,phaseTimer,lastStageAnnouncement=-10000;
const stageNames={overworld:'主世界',nether:'下界',return:'主世界 · 反攻',end:'末地'};
const weatherNames={sunny:'☀ 晴天',rain:'☂ 雨天',storm:'ϟ 雷暴',night:'☾ 黑夜',nether:'♨ 炽热',end:'✦ 虚空'};
const weatherHints={sunny:'适合采集与准备装备',rain:'火焰伤害降低 · 雷电伤害增强',storm:'放置避雷针，引雷打击怪群',night:'敌人数量增加，守住基地',nether:'主世界少量入侵 · 下界生物来袭',end:'摧毁四座末地水晶，迎战末影龙'};
const waveAnnouncement=new WaveAnnouncement({stageNames,weatherNames,show:(caption,title,description)=>showPhase(caption,title,description,true),updateDescription:description=>{$('phase-description').textContent=description;}});

function sound(type, intensity = 1, options = {}) {
  audio.play(type,{intensity,...options});
}
function unlockAudio() { void Promise.resolve(audio.unlock()).catch(()=>{}); }

function burst(x, y, color, n = 9, speed = 100) {
  for (let i = 0; i < n && fx.particles.length < 260; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (.25 + Math.random());
    fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, life: .25 + Math.random() * .35, max: .6, size: 1 + Math.random() * 2.8 });
  }
}

function onEvent(e) {
  if(e.type==='beam'){sound('beam',.75);feedback.emitSparks(e.x??e.segments?.[0]?.from.x??500,e.y??e.segments?.[0]?.from.y??360,e.color||'#d7b5ff',10,50);return;}
  if(e.type==='buildEffect'){
    world.buildEffects.emit(e);
    if(e.effect==='frostBurst'){sound('shatter',.75);feedback.emitSparks(e.x,e.y,e.color||'#b7eeff',20,140);}
    else if(e.effect==='quake'){sound('quake',.55);feedback.emitSparks(e.x,e.y,e.color||'#dfbe85',8,55);}
    else if(e.effect==='gravityCollapse'){sound('gravity',.7);feedback.emitSparks(e.x,e.y,e.color||'#cda2ff',15,85);}
    else if(e.effect==='fireSpread')sound('ignite',.35);
    return;
  }
  if(e.type==='catch'){aimFeedback.showCatch(e);feedback.emitSparks(e.x,e.y,e.grade==='perfect'?'#fff1ab':'#bceafa',10,60);sound('catch',.7,{combo:e.streak,grade:e.grade});return;}
  if(e.type==='catchShot'){aimFeedback.confirmShot(e);feedback.emitSparks(e.x,e.y,'#fff1b3',12,110);return;}
  if(e.type==='waveStart'){waveAnnouncement.showWave(e,game.state.weather);return;}
  if(e.type==='weatherStrike'){world.weatherStrike(e);sound('lightning',.65);return;}
  if(e.type==='weatherChange'){if(waveAnnouncement.updateWeather(game.state.stage,e.weather))return;if(performance.now()-lastStageAnnouncement>1500&&['sunny','rain','storm','night'].includes(e.weather))showPhase('天气变化',weatherNames[e.weather],weatherHints[e.weather]);return;}
  if(e.type==='stageChange'){lastStageAnnouncement=performance.now();showPhase('新的阶段',stageNames[e.to||e.stage],game.getObjective());lastMaterials='';lastBuild='';lastWave=0;return;}
  if(e.type==='portalRise'){showPhase('村民援助','末地之门升起','三波反攻已抵挡，准备进入末地');return;}
  if(e.type==='portalBuild'){toast('传送门正在升起，准备穿越');return;}
  if(e.type==='transitionStart'){feedback.reset();world.buildEffects.reset();fx.particles.length=fx.rings.length=fx.bolts.length=fx.melts.length=0;cancelAim();shopOpen=false;craftOpen=false;beaconOpen=false;stationOpen=null;hoverBase=false;itemMode=null;return;}
  if(e.type==='xp'){burst(e.x,e.y,'#a6ed6c',3,35);sound('xp',.4);return;}
  if(e.type==='dropBook'){toast(`获得附魔书：${UPGRADES.find(u=>u.id===e.enchantId)?.name||e.name||'新附魔'}`);lastMaterials='';return;}
  if (e.type === 'bossIntro') { showBossIntro(e); sound('explosion',.65); return; }
  if(e.type==='allyMelt'){fx.melts.push({x:e.x,y:e.y,delay:game.state.phase==='transition'?.7:0});sound('allyMelt',.8);toast('下界过于炎热，雪傀儡融化了',true);lastMaterials='';return;}
  if(e.type==='craft'){sound('craft',.6);return;}
  if(e.type==='beaconBounce'){fx.rings.push({x:500,y:360,r:20,max:85,life:.4,color:'#abfff3'});feedback.emitSparks(e.x,e.y,'#b4fff2',8,65);return;}
  if(e.type==='workerHire'){feedback.emitSparks(e.x,e.y,'#c5ecac',12,55);return;}
  if(e.type==='workerHurt'){feedback.emitSparks(e.x,e.y,'#e9a18c',5,45);return;}
  if(e.type==='workerLeave'){feedback.emitSparks(e.x,e.y,e.reason==='dead'?'#cda58b':'#c5dfb7',8,45);toast(`${e.role==='miner'?'采矿村民':'伐木村民'}${e.reason==='dead'?'倒下了':'的雇佣时间已结束'}`,true);return;}
  const color = e.color || (e.type === 'hurt' ? '#ef816b' : '#edce85');
  if (e.type === 'hit') {
    if(e.effectOnly){burst(e.x,e.y,color,4,45);return;}
    feedback.impact(e);
    const mining=e.target==='resource';
    sound(mining?(e.broken?'break':'mine'):'hit',mining?.7:.8,{combo:e.combo||0,crit:!!e.crit,burning:!!e.burning,shield:!!e.shield,material:e.material});
    if(e.broken)feedback.burst(e.x,e.y,e.material==='wood'?'#af9b62':'#d2cac3',.8);
  } else if (e.type === 'kill') {
    feedback.burst(e.x,e.y,'#f4d489',.85);sound('kill',.65,{combo:e.combo||game.state.combo});
    fx.rings.push({ x: e.x, y: e.y, r: 8, max: 42, life: .32, color: '#edd88e' });
  } else if (e.type === 'pulse') {
    const pulseColor = e.color || { rod:'#ffb849', tnt:'#ffac5d', creeper:'#e4cf79', warden:'#9af8ed' }[e.source] || '#b1e99a';
    fx.rings.push({ x: e.x, y: e.y, r: 8, max: e.radius || 110, life: .65, color: pulseColor });
    if(['rod','tnt','creeper','steam','fire','fire_charge','base','warden','recall','beacon_shock'].includes(e.source))feedback.burst(e.x,e.y,pulseColor,1.1);
    else feedback.emitSparks(e.x,e.y,pulseColor,10,65);
    if(['rod','tnt','creeper','steam','fire','fire_charge','beacon_shock'].includes(e.source))sound('explosion',e.source==='tnt'?1:.65,{combo:game.state.combo});
  } else if (e.type === 'shot') {
    feedback.emitSparks(e.x,e.y,'#fff1b8',9,95);sound('shot',1);
  } else if (e.type === 'hurt') {
    fx.rings.push({ x: 500, y: 360, r: 43, max: 90, life: .5, color: '#ef816b' });
    feedback.burst(500,360,'#f47b67',1.3);sound('hurt',.85);
  } else if (e.type === 'level') sound('level', .9);
  else if (e.type === 'recall') { burst(e.x, e.y, '#8fc8b2', 22, 180); sound('recall'); }
  else if (e.type === 'lightning' && e.from && e.to) {
    world.buildEffects.emit(e); sound('lightning',.6);
  } else if (e.type === 'bounce') sound('bounce', .35);
}

const game = new Game({ onEvent });
const stationPanel = new WorkbenchPanel(game,{notify:toast,onAction:()=>{lastBuild='';lastMaterials='';if(!game.state.balls.some(b=>b.id===selectedBallId))selectedBallId=game.state.balls.find(b=>b.type==='cue')?.id; sound('level',.7);updateUI(true);}});
const craftingPanel=new CraftingPanel(game,{notify:toast,onAction:()=>{lastBuild='';lastMaterials='';updateUI(true);},onSelect:recipe=>world.setCraftRecipe(recipe)});
const beaconPanel=new BeaconPanel(game,{notify:toast,onAction:()=>{lastBuild='';lastMaterials='';sound('craft',.75);updateUI(true);}});
const buildPanel=new BuildPanel(game,{container:$('build-panel')});
const upgradeTargetPanel=new UpgradeTargetPanel(game,{container:$('upgrade-target-panel'),notify:toast,onSelected:ballId=>{
  selectedBallId=ballId;hoverId=null;lastBuild='';canvas.style.cursor='default';
  const ball=game.state.balls.find(candidate=>candidate.id===ballId);toast(`${describeBall(ball).name} · 炮台 ${ball?.enchantments?.stationary_turret||1} 级`);sound('level',.6);updateUI(true);
  if(game.state.phase==='playing'){unlockAudio();canvas.focus({preventScroll:true});}
},onCancel:()=>{hoverId=null;canvas.style.cursor='default';updateUI(true);$('upgrade-choices').querySelector('button')?.focus({preventScroll:true});}});
const timeText = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const cueBall = () => game.state.balls.find((b) => b.type === 'cue');

function showPhase(caption,title,description,keepWave=false){if(!keepWave)waveAnnouncement.clear();$('phase-caption').textContent=caption;$('phase-name').textContent=title||'';$('phase-description').textContent=description||'';$('phase-announcement').hidden=false;clearTimeout(phaseTimer);phaseTimer=setTimeout(()=>$('phase-announcement').hidden=true,2800);}

function toast(message, bottom=false) {
  $('toast').dataset.bottom=String(bottom);$('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2000);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  width = rect.width; height = rect.height;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  fxCanvas.width = Math.round(width * ratio); fxCanvas.height = Math.round(height * ratio);
  world.resize(width, height);
  scale = Math.min(width / WORLD.width, height / WORLD.height);
  offsetX = (width - WORLD.width * scale) / 2; offsetY = (height - WORLD.height * scale) / 2;
}
new ResizeObserver(resize).observe(canvas);

function point(event) {
  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left, sy = event.clientY - rect.top;
  return { ...world.screenToWorld(sx, sy), sx, sy };
}
function findBall(p, touch = false) { return world.pickBall(p.sx, p.sy, game.state.balls, touch); }
function updateAim(p) {
  aim.x = p.x; aim.y = p.y;
  if (!aim.down || !aim.origin) return;
  const dx = aim.origin.x - p.x, dy = aim.origin.y - p.y;
  aim.distance = Math.hypot(dx, dy);
  aim.charge = aim.mode==='beam'?game.getAimInfo().chargeProgress:Math.min(1, aim.distance / (160 / (game.state.stats.chargeSpeed || 1)));
  if (aim.distance > .5) aim.angle = Math.atan2(dy, dx);
}
canvas.addEventListener('pointerdown', (e) => {
  if(e.button===0&&upgradeTargetPanel.active){const ball=findBall(point(e),e.pointerType==='touch');if(ball)upgradeTargetPanel.select(ball.id);e.preventDefault();return;}
  if (e.button !== 0 || game.state.phase !== 'playing' || aim.down) return;
  const p = point(e);
  if (itemMode) { const id=itemMode; if(game.useItem(id,p.x,p.y,selectedBallId)){toast(`${itemInfo[id].name}已使用`);lastMaterials='';}else toast('无法使用：请检查道具数量或目标方块是否被抓住');itemMode=null;canvas.style.cursor='default';return; }
  if(world.pickBase(p.sx,p.sy,game.state.balls)){openBeacon();return;}
  const ball = findBall(p, e.pointerType === 'touch');
  if(!ball){if(world.pickPortal(p.sx,p.sy))activatePortal();return;}
  unlockAudio();if(!game.beginAim(ball.id))return;feedback.hitStop=0;
  selectedBallId=ball.id;lastBuild='';
  aim.down = true; aim.charge = 0; aim.distance = 0; aim.pointerId = e.pointerId;aim.mode=game.getAimInfo().mode;aim.readySound=false;
  aim.origin = p; aim.ballId = ball.id; hoverId = ball.id; updateAim(p);
  canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if(upgradeTargetPanel.active){const ball=findBall(point(e),e.pointerType==='touch');hoverId=ball?.id??null;hoverBase=false;canvas.style.cursor=ball?(game.canChooseUpgradeTarget(ball.id).ok?'pointer':'not-allowed'):'default';return;}
  if (aim.pointerId !== null && e.pointerId !== aim.pointerId) return;
  const p = point(e); updateAim(p);
  if (!aim.down) { hoverBase=game.state.phase==='playing'&&!itemMode&&world.pickBase(p.sx,p.sy,game.state.balls);hoverId=game.state.phase==='playing'&&!hoverBase?findBall(p)?.id??null:null;canvas.style.cursor=itemMode?'crosshair':hoverId!==null?'grab':hoverBase?'pointer':'default'; }
});
canvas.addEventListener('pointerleave',()=>{if(!aim.down)hoverId=null;hoverBase=false;});
canvas.addEventListener('pointerup', (e) => {
  if (!aim.down || e.pointerId !== aim.pointerId) return;
  updateAim(point(e));
  if(game.state.phase==='playing'){
    if(aim.mode==='beam'){
      if(game.getAimInfo().ready)game.shoot(aim.angle,1,aim.ballId);
      else toast('光束尚未蓄满 · 按住蓄力后再松手');
    }else if(aim.distance*scale>=6)game.shoot(aim.angle,aim.charge,aim.ballId);
  }
  cancelAim();
});
function cancelAim() {
  const hadCapture=game.getAimInfo().active;game.cancelAim();if(hadCapture)aimFeedback.reset();
  const id = aim.pointerId;
  aim.down = false; aim.charge = 0; aim.pointerId = null; aim.origin = null; aim.ballId = null; aim.distance = 0;aim.mode='ball';aim.preview=null;aim.readySound=false;
  canvas.style.cursor = 'default';
  if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
}
canvas.addEventListener('pointercancel', cancelAim);
canvas.addEventListener('lostpointercapture', () => { if (aim.down) cancelAim(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function start() {
  waveAnnouncement.clear();lastStageAnnouncement=-10000;
  unlockAudio(); cancelAim(); shopOpen=false;craftOpen=false;beaconOpen=false;stationOpen=null;hoverBase=false;itemMode=null; lastMaterials=''; game.start(); selectedBallId=game.state.balls[0].id; lastBuild=''; lastWave=0;
  $('boss-intro').hidden = true; clearTimeout(bossTimer);$('phase-announcement').hidden=true;clearTimeout(phaseTimer);
  fx.particles.length = fx.rings.length = fx.bolts.length = fx.melts.length = 0;feedback.reset();aimFeedback.reset();world.buildEffects.reset();buildPanel.reset();
  $('best-score').textContent = save.best.toLocaleString();
  canvas.focus({ preventScroll: true }); toast('第一波来袭 · 按住草方块向后拖，松手出杆');
  updateUI(true);
}
function pause(){if(upgradeTargetPanel.active){upgradeTargetPanel.cancel();return;}if(shopOpen||craftOpen||beaconOpen||stationOpen){closeModal();return;}if(itemMode){itemMode=null;canvas.style.cursor='default';return;}cancelAim();game.togglePause();if(game.state.phase==='playing')unlockAudio();updateUI(true);}
function recall() { if (game.state.phase !== 'playing') return; cancelAim(); if (game.recall()) toast('草方块归位 · 下一杆，继续'); }
$('start-button').addEventListener('click', start);
$('again-button').addEventListener('click', start);
$('restart-button').addEventListener('click', start);
$('pause-button').addEventListener('click', pause);
$('resume-button').addEventListener('click', pause);
$('recall-button').addEventListener('click', recall);
$('sound-button').addEventListener('click',()=>{save.muted=!save.muted;audio.setMuted(save.muted);writeSave(save);if(!save.muted)unlockAudio();updateSound();});
$('music-button').addEventListener('click',()=>{save.musicMuted=!save.musicMuted;audio.setMusicMuted(save.musicMuted);writeSave(save);if(!save.musicMuted)unlockAudio();updateSound();});
function updateSound(){
  $('sound-button').classList.toggle('muted',save.muted);$('sound-button').setAttribute('aria-label',save.muted?'开启全部声音':'关闭全部声音');$('sound-button').title=save.muted?'开启全部声音':'静音全部声音';
  $('music-button').classList.toggle('muted',save.musicMuted||save.muted);$('music-button').setAttribute('aria-label',save.musicMuted?'开启背景音乐':'关闭背景音乐');$('music-button').title=save.muted?'总声音已静音':save.musicMuted?'开启原创背景音乐':'关闭原创背景音乐';
}
document.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if(upgradeTargetPanel.handleKey(e))return;
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)&&e.key!=='Escape')return;
  if(game.state.phase==='upgrade'&&['1','2','3'].includes(e.key)){e.preventDefault();selectUpgrade(game.state.choices[Number(e.key)-1]);return;}
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p') { e.preventDefault(); pause(); }
  else if(e.key.toLowerCase()==='b'){e.preventDefault();beaconOpen?closeModal():openBeacon();}
  else if(e.key.toLowerCase()==='c'){e.preventDefault();craftOpen?closeModal():openCraft();}
  else if (e.key.toLowerCase() === 'e') { e.preventDefault(); shopOpen ? closeShop() : openShop(); }
  else if (e.key.toLowerCase() === 'r') { e.preventDefault(); recall(); }
  else if(e.key.toLowerCase()==='f'){e.preventDefault();stationOpen==='enchantingTable'?closeModal():openStation('enchantingTable');}
  else if(e.key.toLowerCase()==='g'){e.preventDefault();stationOpen==='anvil'?closeModal():openStation('anvil');}
  else if(['playing','paused'].includes(game.state.phase)&&['1','2','3','4'].includes(e.key)){e.preventDefault();equipRod(RODS[Number(e.key)-1]?.id);}
});
function blurPause() { cancelAim(); if (game.state.phase === 'playing') { game.togglePause(); updateUI(true); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) blurPause(); });
window.addEventListener('blur', blurPause);

function selectUpgrade(id) {
  if (!id) return;
  if (game.chooseUpgrade(id)) {
    const upgrade = UPGRADES.find((u) => u.id === id);
    if(game.state.upgradeTarget){cancelAim();hoverBase=false;hoverId=null;lastBuild='';updateUI(true);return;}
    toast(`${upgrade?.name || '强化'} · 已获得`); lastBuild = ''; updateUI(true);
    if (game.state.phase === 'playing') {unlockAudio();canvas.focus({ preventScroll: true });}
  }
}

function openModal(type) {
  const s=game.state;if(!['playing','paused'].includes(s.phase))return;
  if(!['shop','craft','beacon'].includes(type)&&!s.stations?.[type]){toast('先按 C 合成并解锁这个工作台');return;}
  if(!shopOpen&&!craftOpen&&!beaconOpen&&!stationOpen)modalWasPaused=s.phase==='paused';
  cancelAim();hoverBase=false;itemMode=null;if(s.phase==='playing')game.togglePause();
  shopOpen=type==='shop';craftOpen=type==='craft';beaconOpen=type==='beacon';stationOpen=shopOpen||craftOpen||beaconOpen?null:type;lastMaterials='';
  if(stationOpen)stationPanel.show(stationOpen);if(craftOpen)craftingPanel.show();if(beaconOpen)beaconPanel.show();updateUI(true);
}
function openShop(){openModal('shop');}
function openCraft(){openModal('craft');}
function openBeacon(){openModal('beacon');}
function openStation(kind){openModal(kind);}
function closeModal(){
  if(!shopOpen&&!craftOpen&&!beaconOpen&&!stationOpen)return;shopOpen=false;craftOpen=false;beaconOpen=false;stationOpen=null;hoverBase=false;
  if(!modalWasPaused&&game.state.phase==='paused')game.togglePause();
  if(game.state.phase==='playing')unlockAudio();
  updateUI(true);canvas.focus({preventScroll:true});
}
function closeShop(){closeModal();}
function equipRod(id){
  if(!id)return;cancelAim();
  if(game.equipRod(id)){const rod=RODS.find(r=>r.id===id);toast(`已装备${rod.name} · 影响下一次击球`);lastBuild='';updateUI(true);}
  else toast('先合成这根球杆，解锁后即可切换');
}
$('beacon-button').addEventListener('click',()=>beaconOpen?closeModal():openBeacon());
$('beacon-close').addEventListener('click',closeModal);
$('shop-button').addEventListener('click',()=>shopOpen?closeModal():openShop());
$('shop-close').addEventListener('click',closeModal);
$('craft-button').addEventListener('click',()=>craftOpen?closeModal():openCraft());
$('crafting-close').addEventListener('click',closeModal);
for(const button of document.querySelectorAll('[data-shop-tab]'))button.addEventListener('click',()=>{shopTab=button.dataset.shopTab;lastMaterials='';updateUI(true);});
$('portal-action').addEventListener('click',activatePortal);
$('station-close').addEventListener('click',closeModal);
$('enchanting-table-button').addEventListener('click',()=>stationOpen==='enchantingTable'?closeModal():openStation('enchantingTable'));
$('anvil-button').addEventListener('click',()=>stationOpen==='anvil'?closeModal():openStation('anvil'));
$('view-button').addEventListener('click', () => { cancelAim(); world.rotate(); });
$('quality-button').addEventListener('click', () => {
  const quality=world.toggleQuality(),high=quality==='high';
  $('quality-button').textContent=high?'☀ 光影':'☁ 流畅';
  $('quality-button').setAttribute('aria-label',high?'切换到流畅画质':'切换到光影画质');
  toast(high?'光影已开启 · 暖阳与柔和泛光':'流畅模式 · 降低渲染开销');
});
function activateItem(id){
  if(game.state.phase!=='playing')return;
  const check=game.canUseItem(id);if(!check.ok){toast(check.reason);return;}
  cancelAim();
  if(itemInfo[id].target){
    itemMode=itemMode===id?null:id;canvas.style.cursor=itemMode?'crosshair':'default';
    if(itemMode)toast(id==='ender_pearl'?'点击目标位置，传送最后选中的方块':'点击地面选择道具作用位置');
  }else if(game.useItem(id)){toast(`${itemInfo[id].name}已使用`);lastMaterials='';}
}
$('qte-button').addEventListener('click', () => { const qte=game.state.qte;if(qte&&game.clickQte(qte.enemyId)) { sound('hit'); if(!game.state.qte)toast('方块挣脱了末影人的束缚！'); } });

function updateQte() {
  const qte=game.state.qte, button=$('qte-button');
  button.hidden=!qte||game.state.phase!=='playing'||shopOpen||craftOpen||beaconOpen||!!stationOpen;
  if(button.hidden)return;
  const enemy=game.state.enemies.find(e=>e.id===qte.enemyId);if(!enemy){button.hidden=true;return;}
  const p=world.project(enemy.x,enemy.y,105);
  button.style.left=`${Math.max(70,Math.min(width-70,p.x))}px`;button.style.top=`${Math.max(45,Math.min(height-55,p.y))}px`;
  $('qte-count').textContent=qte.remainingClicks;
}
function showBossIntro(event) {
  $('boss-name').textContent=event.name||{wither:'凋零',dragon:'末影龙',warden:'循声守卫'}[event.kind]||'强敌';
  $('boss-portrait').src=world.portrait(event.kind);$('boss-intro').hidden=false;
  clearTimeout(bossTimer);bossTimer=setTimeout(()=>$('boss-intro').hidden=true,4200);
}
function materialChip(id,count) {
  const chip=document.createElement('span');chip.className='material-chip';chip.title=materialInfo[id]?.[0]||id;
  chip.append(textureElement(materialInfo[id]?.[1]||'stone'));
  const number=document.createElement('b');number.textContent=count;chip.append(number);return chip;
}
function updateInventory(){
  const s=game.state;
  $('enchanting-table-button').hidden=!s.stations?.enchantingTable;$('anvil-button').hidden=!s.stations?.anvil;
  const active=['playing','paused'].includes(s.phase);$('enchanting-table-button').disabled=!active;$('anvil-button').disabled=!active;
  const shockLevel=s.beacon?.upgrades?.shock||0;$('beacon-world-state').hidden=!shockLevel;$('beacon-world-state').textContent=shockLevel?`震撼 ${s.beacon.shockCooldown>0?`${s.beacon.shockCooldown.toFixed(1)}s`:'已就绪'}`:'';
  $('station-unlock-hint').hidden=!!(s.stations?.enchantingTable||s.stations?.anvil);
  $('book-count').textContent=`附魔书 ${Object.values(s.books||{}).reduce((a,b)=>a+b,0)}`;
  const key=JSON.stringify([s.stage,s.pickaxe,s.materials,s.ownedRods,s.stations,s.items,s.books,s.bookOffers,s.shopOffers,s.balls.filter(b=>b.type!=='ghost').length,s.allies?.length,shopOpen,shopTab,s.phase]);if(lastMaterials===key)return;lastMaterials=key;
  for(const id of ['materials','shop-materials']){const target=$(id);target.replaceChildren();for(const [name,count] of Object.entries(s.materials||{})){if(count>0||['wood','stone','iron','diamond','obsidian'].includes(name))target.append(materialChip(name,count));}}
  const pick=PICKAXES.find(p=>p.id===s.pickaxe)||PICKAXES[0];$('pickaxe-status').replaceChildren();if(pick.id!=='hand')$('pickaxe-status').append(textureElement(`${pick.id==='wood'?'wooden':pick.id}-pickaxe`));$('pickaxe-status').append(document.createTextNode(`采集：${pick.name}`));$('pickaxe-status').title=`采集效率 ×${pick.multiplier} · 硬质矿石系数 ×${pick.hardMultiplier||1}`;
  const consumables=$('consumables');consumables.replaceChildren();
  for(const [id,item] of Object.entries(itemInfo)){const count=s.items?.[id]||0;if(!count&&id!=='potion')continue;const button=document.createElement('button');button.id=`item-${id}`;button.title=item.name;button.disabled=s.phase!=='playing'||!count;button.append(textureElement(item.texture));const name=document.createElement('small');name.textContent=item.name;const amount=document.createElement('b');amount.textContent=count;button.append(name,amount);button.addEventListener('click',()=>activateItem(id));consumables.append(button);}
  if(shopOpen){
    document.querySelectorAll('[data-shop-tab]').forEach(button=>button.classList.toggle('active',button.dataset.shopTab===shopTab));
    const target=$('shop-recipes');target.replaceChildren();
    const offers=(s.shopOffers||[]).filter(offer=>offer.category===shopTab);
    if(!offers.length){const empty=document.createElement('p');empty.className='station-empty';empty.textContent='本波暂无这类商品，下一波再来看看。';target.append(empty);}
    for(const offer of offers){
      const check=game.canBuy(offer.id),card=document.createElement('button');card.className=`recipe-card${offer.enchantId?' book-offer':''}`;card.disabled=!check.ok;card.title=check.reason||offer.name;
      const firstMaterial=Object.keys(offer.materials||{})[0];const texture=offer.enchantId?'enchanted-book':offer.ally==='snow_golem'?'snow-block':offer.ally?'iron-ingot':offer.item?(itemInfo[offer.item]?.texture||'apple'):firstMaterial?getMaterialVisual(firstMaterial).texture:'crafting-top';card.append(textureElement(texture));
      const body=document.createElement('div'),name=document.createElement('b'),cost=document.createElement('small');name.textContent=offer.name;cost.textContent=offer.stock<=0?'本波已售罄':Object.entries(offer.cost||{}).map(([id,n])=>`${materialInfo[id]?.[0]||getMaterialVisual(id).name}×${n}`).join(' · ');body.append(name,cost);
      if(offer.enchantId){const spec=UPGRADES.find(u=>u.id===offer.enchantId),effect=document.createElement('small');effect.className='book-effect-preview';effect.textContent=spec?.description||'';body.append(effect);card.title=`${spec?.description||''} ${buildHints[offer.enchantId]||spec?.synergy||''}`;}
      card.append(body);
      card.addEventListener('click',()=>{if(game.buyOffer(offer.id)){toast(`已购买：${offer.name}`);lastMaterials='';lastBuild='';updateUI(true);}else toast(game.canBuy(offer.id).reason);});target.append(card);
    }
  }
}
function activatePortal(){
  const s=game.state;if(!['playing','paused'].includes(s.phase))return;cancelAim();
  if(shopOpen||craftOpen||beaconOpen||stationOpen){shopOpen=false;craftOpen=false;beaconOpen=false;stationOpen=null;hoverBase=false;}
  if(s.portal){if(s.portal.riseTimer>0){toast('传送门正在升起');updateUI(true);return;}game.enterPortal();}
  else{const check=game.canBuildPortal();if(!game.buildPortal()){toast(check.reason);updateUI(true);return;}if(s.phase==='paused')game.togglePause();}
  lastMaterials='';updateUI(true);
}
function updateExpedition(){
  $('arena-realm').textContent=stageNames[game.state.stage]||'主世界';
  const s=game.state;document.body.dataset.realm=s.stage||'overworld';$('realm-label').textContent=stageNames[s.stage]||'主世界';$('stage-clock').textContent=stageNames[s.stage]||'主世界';$('weather-label').textContent=weatherNames[s.weather]||s.weather;$('weather-label').title=weatherHints[s.weather]||'';$('objective-text').textContent=game.getObjective();
  const button=$('portal-action');button.hidden=!s.portal&&!['overworld','nether'].includes(s.stage);
  if(s.portal){button.textContent=s.portal.riseTimer>0?'传送门升起中…':s.portal.kind==='end'?'进入末地':s.portal.kind==='return'?'返回主世界':'进入下界';button.disabled=s.portal.riseTimer>0||!['playing','paused'].includes(s.phase);}
  else{button.textContent=s.stage==='nether'?'搭建返程门':'搭建下界门';button.disabled=!game.canBuildPortal().ok;}
}

function renderChoices() {
  const container = $('upgrade-choices'); container.replaceChildren();
  $('upgrade-note').textContent=`战场已暂停 · 按 1 / 2 / 3 选择${game.state.pendingUpgrades>1?` · 还有 ${game.state.pendingUpgrades} 次待选强化`:''}`;
  game.state.choices.forEach((id, index) => {
    const upgrade = UPGRADES.find((u) => u.id === id); if (!upgrade) return;
    const button = document.createElement('button'); button.className = 'upgrade-card';
    const symbol = document.createElement('span'); symbol.className = 'upgrade-symbol'; symbol.append(textureElement(textureFor(id, true)));
    const category = document.createElement('span'); category.className = 'upgrade-category'; category.textContent = categoryNames[upgrade.category] || '强化';
    const key = document.createElement('span'); key.className = 'choice-key'; key.textContent = `0${index + 1}`;
    const nextRank=(game.state.upgrades[id]||0)+1;
    const heading = document.createElement('h3'); heading.textContent = id==='stationary_turret'?`${upgrade.name} · 选择方块`:`${upgrade.name} ${nextRank>1?`· ${nextRank}阶`:''}`;
    const description = document.createElement('p'); description.textContent = upgrade.description;
    button.append(category, symbol, key, heading, description);
    if(buildHints[id]||upgrade.synergy){const synergy=document.createElement('small');synergy.className='upgrade-synergy';synergy.textContent=buildHints[id]||upgrade.synergy;button.append(synergy);}
    button.addEventListener('click', () => selectUpgrade(id)); container.append(button);
  });
}

let uiClock = 0;
function updateUI(force = false) {
  const s = game.state;
  upgradeTargetPanel.update();
  const phaseChanged = lastPhase !== s.phase;
  if (phaseChanged || force) {
    $('start-panel').hidden = s.phase !== 'ready';
    $('pause-panel').hidden = s.phase !== 'paused' || shopOpen || craftOpen || beaconOpen || !!stationOpen;
    $('shop-panel').hidden = !shopOpen;
    $('crafting-panel').hidden = !craftOpen;
    $('station-panel').hidden = !stationOpen;
    $('beacon-panel').hidden = !beaconOpen;
    $('upgrade-panel').hidden = s.phase !== 'upgrade'||Boolean(s.upgradeTarget);
    $('end-panel').hidden = !['won', 'lost'].includes(s.phase);
    $('pause-button').disabled = !['playing', 'paused'].includes(s.phase);
    $('pause-button').setAttribute('aria-label', s.phase === 'paused' ? '继续游戏' : '暂停游戏');
    if (s.phase === 'upgrade') { cancelAim(); if(!s.upgradeTarget)renderChoices(); }
    if (['won', 'lost'].includes(s.phase) && phaseChanged) {
      cancelAim(); const won = s.phase === 'won'; const newBest = s.score > save.best;
      save.best = Math.max(save.best, Math.round(s.score)); writeSave(save);
      $('end-title').textContent = won ? '末影龙倒下了！' : '防线失守，再来一杆。';
      $('end-eyebrow').textContent = won ? 'THE CORE STANDS. SO DO YOU.' : 'UNTIL THE NEXT SHOT';
      $('end-description').textContent = `${newBest ? '新的个人最佳！' : ''}存活 ${timeText(s.elapsed)} · ${s.shots} 次击球 · 收集经验 ${s.totalXp||0}`;
      $('end-score').textContent = Math.round(s.score).toLocaleString(); $('end-kills').textContent = s.kills; $('end-combo').textContent = s.maxCombo;
      $('best-score').textContent = save.best.toLocaleString();
    }
    lastPhase = s.phase;
  }
  updateInventory();updateExpedition();
  const enemyScaling=game.getEnemyScaling();$('enemy-scaling').textContent=`新生怪血量 ×${enemyScaling.hpMultiplier.toFixed(2)}`;$('enemy-scaling').title=enemyScaling.label;$('enemy-scaling').classList.toggle('empowered',enemyScaling.hpMultiplier>1);
  if(craftOpen)craftingPanel.refresh();
  if(beaconOpen)beaconPanel.refresh();
  if(stationOpen)stationPanel.refresh();
  $('overcharge-status').hidden=!(s.overchargeTimer>0);$('overcharge-status').textContent=`红石过载 ${Math.ceil(s.overchargeTimer||0)}s`;
  const tips=['火焰可以传染；寒冰连续三次命中会触发碎冰爆发。','炮台按住蓄力、拖拽定向：幻影增加光束，红石让光束引雷。','接住运动中的方块再击出：接速越高，加成越强。','棱镜分叉继承元素；引力聚怪让震波、雷链与传染覆盖更多敌人。','瞄准时世界仍会慢速前进；末地烛与时缓附魔增强减速。','点击信标或按 B：升级基地、雇佣采集村民。','每次弹射提高伤害；让不同方块互撞，本轮共享效果。','拾经验升级三选一；按 C 合成，按 E 与村民交易。','先合成镐子提高采集效率，再开采黑曜石前往下界。','雨天削弱火焰、增强雷电；雷暴时可放置避雷针。','继承红石效果的方块也能撞爆 TNT；停下后共享结束。'];
  $('game-hint').textContent = tips[Math.floor(s.elapsed / 12) % tips.length];
  $('shop-button').disabled = !['playing','paused'].includes(s.phase);$('craft-button').disabled=$('shop-button').disabled;$('beacon-button').disabled=$('shop-button').disabled;$('beacon-button').title=`信标 ${s.beacon?.level||1} 级 · 点击基地也可打开`;
  $('hp-text').textContent = `${Math.ceil(s.hp)} / ${s.maxHp}`;
  const hearts = $('hp-hearts');
  if (!hearts.children.length) for (let i = 0; i < 10; i++) { const heart = document.createElement('span'); heart.className = 'heart'; hearts.append(heart); }
  Array.from(hearts.children).forEach((heart, index) => { const fill = s.hp / s.maxHp * 10 - index; heart.className = 'heart' + (fill <= 0 ? ' empty' : fill < 1 ? ' half' : ''); });
  $('shield-text').textContent = s.maxShield > 0 ? `护盾 ${Math.ceil(s.shield)} / ${s.maxShield}` : '无护盾';
  $('hp-fill').style.width = `${Math.max(0, s.hp / s.maxHp * 100)}%`;
  $('hp-fill').style.background = s.hp < s.maxHp * .3 ? '#e87b68' : '#8cc8a5';
  $('base-status').textContent = s.phase === 'ready' ? '防线就绪' : s.hp < s.maxHp * .3 ? '核心告急' : '防线运转中';
  $('score').textContent = String(Math.round(s.score)).padStart(5, '0'); $('kills').textContent = s.kills;
  $('clock').textContent = timeText(s.elapsed); $('level').textContent = String(s.xp);
  $('run-level').textContent=String(s.level);
  $('xp-fill').style.width = `${Math.min(100,(s.levelXp||0)/(s.xpNext||5)*100)}%`;
  $('level-progress').title=`升级进度 ${s.levelXp||0} / ${s.xpNext||5} · 附魔经验 ${s.xp}`;
  $('wave-number').textContent = String(s.stageWave || 1).padStart(2, '0');
  $('wave-title').textContent = s.phase==='ready'?'等待开球':`${stageNames[s.stage]} · 第 ${s.stageWave||1} 波`;
  $('wave-subtitle').textContent = s.phase === 'ready' ? 'THE OPENING SHOT' : `场上 ${s.enemies.length} 只怪物 · 经验需要方块拾取`;
  $('arena-state').textContent = { ready: '等待开球', playing: aim.down ? '慢动作瞄准' : '生存中', paused: '已暂停', upgrade: s.upgradeTarget?'选择炮台方块':'升级选择', transition:'正在传送', won: '守卫成功', lost: '基地失守' }[s.phase];
  if(s.stageWave>lastWave&&s.phase==='playing'&&s.stageWave>1)toast(`${stageNames[s.stage]} · 第 ${s.stageWave} 波`);
  lastWave=s.stageWave;
  $('combo').hidden = s.combo < 2 || s.phase === 'ready'; $('combo').querySelector('strong').textContent = s.combo;$('combo').dataset.tier=s.combo>=30?'3':s.combo>=12?'2':s.combo>=5?'1':'0';
  $('recall-button').disabled = s.phase !== 'playing' || s.recallCooldown > 0 || s.balls.find(b => b.type === 'cue')?.heldBy != null;
  $('recall-status').textContent = s.recallCooldown > 0 ? `${s.recallCooldown.toFixed(1)} 秒后就绪` : '随时回防';
  const selected=s.balls.find(b=>b.id===selectedBallId)||s.balls.find(b=>b.type==='cue');
  selectedMode=game.getBuildInfo(selected?.id).mode;
  buildPanel.update(selected?.id,{visible:['playing','paused'].includes(s.phase)&&!shopOpen&&!craftOpen&&!beaconOpen&&!stationOpen});
  const chainBall=describeRicochet(selected).count>0||describeCatch(selected).active?selected:s.balls.reduce((best,ball)=>describeRicochet(ball).multiplier*describeCatch(ball).multiplier>describeRicochet(best).multiplier*describeCatch(best).multiplier?ball:best,null);
  updateRicochetPanel($('ricochet-status'),chainBall,['playing','paused'].includes(s.phase)&&!shopOpen&&!craftOpen&&!beaconOpen&&!stationOpen);
  const build=JSON.stringify([s.activeRod,s.ownedRods,s.pickaxe,s.upgrades,s.rodEnchantments,s.baseEnchantments,s.balls.filter(b=>b.type!=='ghost').map(b=>[b.id,b.traits,b.fusionLevel,b.enchantments]),selected?.id]);
  if(lastBuild!==build){
    lastBuild=build;const list=$('loadout');list.replaceChildren();const rod=RODS.find(r=>r.id===s.activeRod)||RODS[0];
    const items=[{name:rod.name,description:rod.description,texture:rod.texture},...(selected?[{name:describeBall(selected).name,description:describeBall(selected).description,texture:textureFor(selected.type)}]:[])];
    for(const [id,rank] of Object.entries(s.upgrades).filter(([id,rank])=>id!=='rod'&&rank>0)){const spec=UPGRADES.find(u=>u.id===id);if(spec)items.push({name:`${spec.name} ${rank}`,description:'通用强化 · 不占装备附魔槽',texture:textureFor(id)});}
    for(const [id,rank] of Object.entries(s.rodEnchantments?.[s.activeRod]||{})){const spec=UPGRADES.find(u=>u.id===id);items.push({name:`${spec?.name||id} ${rank}`,description:'当前球杆附魔',texture:'enchanted-book'});}
    for(const [id,rank] of Object.entries(selected?.enchantments||{})){const spec=UPGRADES.find(u=>u.id===id);items.push({name:`${spec?.name||id} ${rank}`,description:'选中方块附魔',texture:'enchanted-book'});}
    for(const item of items){const row=document.createElement('div');row.className='equipment';const icon=document.createElement('span');icon.className='equipment-icon';icon.append(textureElement(item.texture));const body=document.createElement('div'),name=document.createElement('b'),desc=document.createElement('small');name.textContent=item.name;desc.textContent=item.description||'';body.append(name,desc);row.append(icon,body);list.append(row);}
    $('build-count').textContent=String(items.length).padStart(2,'0');
    const hotbar=$('hotbar');hotbar.replaceChildren();
    RODS.forEach((r,index)=>{const button=document.createElement('button');button.className=`hotbar-slot${r.id===s.activeRod?' equipped':''}`;button.disabled=!s.ownedRods.includes(r.id);button.title=`${r.name}：${r.description}${button.disabled?'（尚未合成）':''}`;button.setAttribute('aria-label',`装备${r.name}`);button.append(textureElement(r.texture));const key=document.createElement('kbd');key.textContent=index+1;button.append(key);button.addEventListener('click',()=>equipRod(r.id));hotbar.append(button);});
    $('equipped-rod-name').textContent=`${rod.name} · 1–4 切换`;
  }

}

function tickEffects(dt) {
  for(const melt of fx.melts){melt.delay-=dt;if(melt.delay<=0)feedback.emitSparks(melt.x,melt.y,'#e3f8ff',24,80);}
  fx.melts=fx.melts.filter(melt=>melt.delay>0);
  for (const p of fx.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-dt * 4); p.vy *= Math.exp(-dt * 4); p.life -= dt; }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  feedback.update(dt);
  for (const r of fx.rings) { r.r += dt * 120; r.life -= dt; } fx.rings = fx.rings.filter((r) => r.life > 0);
  for (const b of fx.bolts) b.life -= dt; fx.bolts = fx.bolts.filter((b) => b.life > 0);
}
function drawEffects() {
  const k = width / 1100;
  const chainLabels=[];
  for(const ball of game.state.balls){
    const chain=describeRicochet(ball),caught=describeCatch(ball);if(((!chain.active||chain.count<1)&&!caught.active)||ball.heldBy||ball.aimHeld)continue;
    const pos=world.project(ball.x,ball.y,ball.r*2+19);
    for(let tries=0;tries<6&&chainLabels.some(p=>Math.abs(p.x-pos.x)<68&&Math.abs(p.y-pos.y)<13);tries++)pos.y-=13;
    chainLabels.push(pos);
    ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#18200f';ctx.fillStyle=chain.participants.length>1?'#c4f7ff':'#ffe19b';
    const label=`${chain.count>0?`↝${chain.count}`:'接球'} ×${(chain.multiplier*caught.multiplier).toFixed(2)}`;ctx.strokeText(label,pos.x,pos.y);ctx.fillText(label,pos.x,pos.y);
  }
  for (const p of fx.particles) { const pos=world.project(p.x,p.y,15);ctx.globalAlpha=Math.min(1,p.life/.2);ctx.fillStyle=p.color;ctx.fillRect(pos.x,pos.y,Math.max(1,p.size*k),Math.max(1,p.size*k)); }
  ctx.globalAlpha=1;
  for(const r of fx.rings){const pos=world.project(r.x,r.y,2);ctx.globalAlpha=Math.min(1,r.life*2);ctx.strokeStyle=r.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(pos.x,pos.y,r.r*k,r.r*k*.65,0,0,Math.PI*2);ctx.stroke();}
  ctx.globalAlpha=1;
  for(const b of fx.bolts){const from=world.project(b.from.x,b.from.y,24),to=world.project(b.to.x,b.to.y,30);ctx.strokeStyle='#f6df8d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo((from.x+to.x)/2+6,(from.y+to.y)/2-4);ctx.lineTo(to.x,to.y);ctx.stroke();}
  ctx.globalAlpha=1;
  for(const enemy of game.state.enemies){
    if(enemy.hp>=enemy.maxHp&&!enemy.shield)continue;
    const h={enderman:100,dragon:110,warden:110,wither:100}[enemy.kind]||72;
    const pos=world.project(enemy.x,enemy.y,h);ctx.fillStyle='#121b0d';ctx.fillRect(pos.x-15,pos.y,30,3);ctx.fillStyle='#df7266';ctx.fillRect(pos.x-15,pos.y,30*Math.max(0,enemy.hp/enemy.maxHp),3);
    if(enemy.shield>0){ctx.fillStyle='#a4bfd4';ctx.fillRect(pos.x-15,pos.y-5,30*Math.min(1,enemy.shield/(enemy.maxShield||enemy.shield)),2);}
  }
  for(const worker of game.state.workers||[]){
    const pos=world.project(worker.x,worker.y,76);ctx.font='9px monospace';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#152115';ctx.fillStyle=worker.role==='miner'?'#c2eaff':'#d6ed9f';
    const label=`${worker.role==='miner'?'矿工':'伐木'} · ${Math.ceil(Math.max(0,worker.life))}s`;ctx.strokeText(label,pos.x,pos.y);ctx.fillText(label,pos.x,pos.y);
    if(worker.hp<worker.maxHp){ctx.fillStyle='#172016';ctx.fillRect(pos.x-15,pos.y+4,30,3);ctx.fillStyle='#9bcf77';ctx.fillRect(pos.x-15,pos.y+4,30*Math.max(0,worker.hp/worker.maxHp),3);}
  }
  for(const resource of game.state.resources){
    if(resource.hp>=resource.maxHp||resource.hp<=0)continue;
    const pos=world.project(resource.x,resource.y,resource.kind==='tree'?105:46);
    ctx.fillStyle='#16180f';ctx.fillRect(pos.x-17,pos.y,34,4);ctx.fillStyle='#dbd6a3';ctx.fillRect(pos.x-17,pos.y,34*Math.max(0,resource.hp/resource.maxHp),4);
    const spec=describeResource(resource);ctx.font='9px monospace';ctx.textAlign='center';ctx.fillStyle='#e1dec4';ctx.fillText(`${spec.name} · 硬度 ${spec.hardness}`,pos.x,pos.y-5);
  }
  for(const crystal of game.state.crystals||[]){
    if(crystal.hp<=0)continue;const pos=world.project(crystal.x,crystal.y,105);
    ctx.fillStyle='#171022';ctx.fillRect(pos.x-21,pos.y,42,5);ctx.fillStyle=crystal.shield>0?'#a995d4':'#ed78e7';ctx.fillRect(pos.x-21,pos.y,42*Math.max(0,crystal.shield>0?crystal.shield/crystal.maxShield:crystal.hp/crystal.maxHp),5);
    ctx.font='10px monospace';ctx.textAlign='center';ctx.fillStyle='#f0e5ff';ctx.fillText(crystal.shield>0?'黑曜石护壳':'末地水晶',pos.x,pos.y-5);
  }
}
function render(now) {
  const dt = Math.min(.05, (now - lastFrame) / 1000 || .016); lastFrame = now;
  const s = game.state;
  if(aim.down&&(!game.getAimInfo().active||s.phase!=='playing'))cancelAim();
  let simulated=0;
  if(s.phase==='playing'){
    if(aim.down)simulated=game.advanceAim(dt);
    else{simulated=feedback.consumeHitStop(dt);game.update(simulated);}
  }else if(s.phase==='transition'){game.update(dt);simulated=dt;}
  if(aim.down&&(!game.getAimInfo().active||s.phase!=='playing'))cancelAim();
  const active=s.phase==='playing'||s.phase==='ready';
  const aimInfo=game.getAimInfo();
  if(aim.down&&aimInfo.mode==='beam'){
    aim.charge=aimInfo.chargeProgress;aim.preview=game.previewBeam(aim.angle,aim.ballId);
    if(aimInfo.ready&&!aim.readySound){sound('beamReady',.65);aim.readySound=true;}
  }
  if(active)tickEffects(s.phase==='ready'?dt:simulated);
  visualTime+=s.phase==='playing'||s.phase==='transition'?simulated:dt;
  world.render(s,visualTime,s.phase==='playing'?simulated:0,{aim,hoverId,hoverBase:hoverBase&&!beaconOpen,shop:shopOpen,shopTab,station:stationOpen,crafting:craftOpen,upgradeTargetIds:s.upgradeTarget?upgradeTargetPanel.eligibleIds:null});
  const ratio=fxCanvas.width/width;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  if(!shopOpen&&!craftOpen&&!beaconOpen&&!stationOpen&&s.phase!=='upgrade'&&s.phase!=='transition')drawEffects();
  if(!shopOpen&&!craftOpen&&!beaconOpen&&!stationOpen&&!['upgrade','transition','ready'].includes(s.phase))feedback.draw(ctx,(x,y,h)=>world.project(x,y,h),width);
  const shake=feedback.offset(active&&!aim.down&&!shopOpen&&!craftOpen&&!beaconOpen&&!stationOpen);arenaShell.style.setProperty('--impact-x',`${shake.x.toFixed(2)}px`);arenaShell.style.setProperty('--impact-y',`${shake.y.toFixed(2)}px`);
  audio.update({stage:s.stage,weather:s.weather,phase:s.phase,combo:s.combo,boss:s.enemies.some(e=>['dragon','wither','warden'].includes(e.kind))});
  const baseHint=$('base-hover-hint');baseHint.hidden=!hoverBase||aim.down||s.phase!=='playing'||beaconOpen;if(!baseHint.hidden){const p=world.project(500,360,85);baseHint.style.left=`${p.x}px`;baseHint.style.top=`${p.y}px`;}
  const selectedAim=s.balls.find(ball=>ball.id===aim.ballId);
  aimFeedback.update(game.getAimInfo(),{visible:s.phase==='playing'&&!shopOpen&&!craftOpen&&!beaconOpen&&!stationOpen,avoidPoint:selectedAim?world.project(selectedAim.x,selectedAim.y,selectedAim.r):null});
  updateQte();
  $('power-fill').style.width = `${aim.charge * 100}%`;
  const beamAiming=aim.down&&aim.mode==='beam';
  $('power-label').textContent = beamAiming?(aimInfo.ready?'光束就绪':'光束蓄力'):aim.down?aim.charge>.85?'全力击打':'向后拖拽':selectedMode==='beam'?'按住蓄力':'拖拽瞄准';
  $('power-value').textContent = beamAiming?(aimInfo.ready?'松手发射':`${Math.round(aim.charge*100)}%`):aim.down?`${Math.round(aim.charge*100)}%`:selectedMode==='beam'?'拖拽定向 · 松手发射':'按住一个方块';
  const beamStatus=$('beam-charge-status');beamStatus.hidden=!beamAiming;beamStatus.classList.toggle('ready',beamAiming&&aimInfo.ready);
  if(beamAiming)beamStatus.textContent=aimInfo.ready?'✦ 光束就绪 · 松手发射':`◈ 光束蓄力 ${Math.round(aim.charge*100)}% · 拖拽定向`;
  uiClock += dt; if (uiClock > .08 || lastPhase !== s.phase) { updateUI(); uiClock = 0; }
  requestAnimationFrame(render);
}

$('best-score').textContent = save.best.toLocaleString(); updateSound(); resize(); updateUI(true); requestAnimationFrame(render);
