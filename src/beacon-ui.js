import { getMaterialVisual } from './crafting-ui.js';

const ICONS = { level:'beacon', shield:'obsidian', regen:'beacon', pulse:'redstone', recall_burst:'ender-pearl', repair:'iron', base_ricochet:'gold', haste:'blaze-rod', mining_speed:'diamond-pickaxe', shock:'lightning-rod' };
const SECONDARY = new Set(['regen','recall_burst','repair']);
const ROLE_ICONS = { lumberjack:'iron-axe', miner:'wooden-pickaxe' };
const WORKER_ICONS = { speed:'stick', work:'iron', duration:'apple', tool:'iron-pickaxe' };
const asset = name => new URL(`../assets/minecraft/${name}.png`, import.meta.url).href;
const number = (value, fallback=0) => Number.isFinite(value) ? value : fallback;
const text = (node,value) => { const next=String(value??'');if(node.textContent!==next)node.textContent=next; };
const make = (tag,className,content) => { const node=document.createElement(tag);if(className)node.className=className;if(content!==undefined)node.textContent=content;return node; };
function image(name){const node=make('img');node.alt='';node.src=asset(name);node.dataset.texture=name;node.addEventListener('error',()=>{if(node.dataset.fallback)return;node.dataset.fallback='true';node.src=asset('beacon');});return node;}
function setImage(node,name){if(node.dataset.texture===name)return;node.dataset.texture=name;delete node.dataset.fallback;node.src=asset(name);}
function button(className,label){const node=make('button',className,label);node.type='button';return node;}

/** Stable DOM, UI-only selection. Every transaction is rechecked and committed
 * by Game; refreshing inventory or worker timers never recreates buttons. */
export class BeaconPanel {
  constructor(game,{notify=()=>{},onAction=()=>{},onSelect=()=>{},container=null}={}){
    this.game=game;this.notify=notify;this.onAction=onAction;this.onSelect=onSelect;
    this.container=container||document.getElementById('beacon-content');
    if(!this.container)throw new Error('BeaconPanel requires #beacon-content');
    this.tab='beacon';this.selectedBeacon='level';this.selectedRole='lumberjack';this.selectedWorker='hire';this.open=false;
    this.abilityNodes=new Map();this.roleNodes=new Map();this.workerUpgradeNodes=new Map();this.lifeNodes=new Map();this.costNodes=new Map();this.lastSelection='';
    this.build();
  }

  build(){
    this.shell=make('section','beacon-panel');
    this.tabs=make('div','beacon-tabs');this.tabs.setAttribute('role','tablist');this.tabs.setAttribute('aria-label','信标面板分类');
    this.tabButtons={};
    for(const [id,label] of [['beacon','信标能力'],['workers','雇佣村民']]){
      const node=button('beacon-tab',label);node.dataset.beaconTab=id;node.id=`beacon-tab-${id}`;node.setAttribute('role','tab');node.setAttribute('aria-controls',`beacon-view-${id}`);
      node.addEventListener('click',()=>this.setTab(id));node.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();const next=event.key==='Home'?'beacon':event.key==='End'?'workers':this.tab==='beacon'?'workers':'beacon';this.setTab(next);this.tabButtons[next].focus();
      });this.tabs.append(node);this.tabButtons[id]=node;
    }
    this.summary=make('div','beacon-summary');this.levelText=make('strong');this.hpText=make('span');this.summary.append(this.levelText,this.hpText);
    this.workspace=make('div','beacon-workspace');this.left=make('div','beacon-left');
    this.beaconView=make('section','beacon-view');this.beaconView.id='beacon-view-beacon';this.beaconView.setAttribute('role','tabpanel');this.beaconView.setAttribute('aria-labelledby','beacon-tab-beacon');
    this.stage=make('div','beacon-stage');this.stage.setAttribute('aria-label','信标金字塔');
    const pyramid=make('div','beacon-pyramid');const core=image('beacon');core.className='beacon-pyramid-core';pyramid.append(core);
    this.layers=[];for(let layer=1;layer<=4;layer++){const row=make('div','beacon-pyramid-tier');row.dataset.layer=String(layer);row.style.setProperty('--tier',String(layer));pyramid.append(row);this.layers.push(row);}
    this.pyramidCaption=make('p','beacon-pyramid-caption');this.stage.append(pyramid,this.pyramidCaption);
    this.levelButton=this.makeOption('level','beacon-level-option','beacon');this.levelButton.button.dataset.beaconUpgrade='level';this.levelButton.button.addEventListener('click',()=>this.selectBeacon('level'));
    this.primaryGrid=make('div','beacon-ability-grid');this.secondaryGrid=make('div','beacon-ability-grid');
    this.beaconView.append(this.stage,this.levelButton.button,make('h3','beacon-group-title','主能力'),this.primaryGrid,make('h3','beacon-group-title','次能力'),this.secondaryGrid);

    this.workerView=make('section','beacon-view');this.workerView.id='beacon-view-workers';this.workerView.setAttribute('role','tabpanel');this.workerView.setAttribute('aria-labelledby','beacon-tab-workers');
    this.roleGrid=make('div','beacon-role-grid');this.workerStats=make('dl','beacon-worker-stats');this.statNodes={};
    for(const [id,label] of [['speed','移动速度'],['work','采集间隔'],['duration','雇佣任期'],['tool','专属工具']]){const cell=make('div');cell.append(make('dt','',label));const value=make('dd');cell.append(value);this.workerStats.append(cell);this.statNodes[id]=value;}
    this.hireButton=this.makeOption('hire','beacon-hire-option','villager');setImage(this.hireButton.icon,'iron-axe');this.hireButton.button.dataset.workerHireSelect='true';this.hireButton.button.addEventListener('click',()=>{this.selectedWorker='hire';this.refresh(true);});
    this.workerGrid=make('div','beacon-worker-upgrades');this.lifeHeading=make('h3','beacon-group-title');this.lifeList=make('div','beacon-worker-life-list');this.lifeEmpty=make('p','beacon-empty','当前没有这个职业的村民。');
    this.workerView.append(this.roleGrid,this.workerStats,this.hireButton.button,make('h3','beacon-group-title','职业能力与独立工具'),this.workerGrid,this.lifeHeading,this.lifeList,this.lifeEmpty,make('p','beacon-worker-note','任期按战斗时间倒计时。斧头和镐子属于对应职业，与玩家的镐子分开升级。'));
    this.left.append(this.beaconView,this.workerView);

    this.detail=make('section','beacon-detail');this.detail.setAttribute('aria-labelledby','beacon-detail-title');
    this.detailIcon=image('beacon');this.detailIcon.className='beacon-detail-icon';this.detailName=make('h3');this.detailName.id='beacon-detail-title';this.detailRank=make('p','beacon-detail-rank');this.detailDescription=make('p','beacon-detail-description');
    this.costTitle=make('h4','beacon-cost-title','所需材料');this.costList=make('div','beacon-cost-list');this.costEmpty=make('p','beacon-empty');this.reason=make('p','beacon-reason');this.reason.setAttribute('role','status');
    this.confirm=button('beacon-confirm','确认');this.confirm.dataset.beaconConfirm='true';this.confirm.addEventListener('click',()=>this.act());
    this.detail.append(this.detailIcon,this.detailName,this.detailRank,this.detailDescription,this.costTitle,this.costList,this.costEmpty,this.reason,this.confirm);
    this.workspace.append(this.left,this.detail);this.shell.append(this.tabs,this.summary,this.workspace);this.container.replaceChildren(this.shell);
  }

  makeOption(id,className,icon){
    const node=button(`beacon-option ${className}`);const img=image(icon),name=make('strong'),rank=make('span','beacon-option-rank'),badge=make('small','beacon-option-badge');
    node.append(img,name,rank,badge);return{button:node,icon:img,name,rank,badge,id};
  }
  updateOption(node,record,selected,icon){
    text(node.name,record.name||record.id);const rank=record.rank??record.level??0,max=record.maxRank??record.maxLevel;
    text(node.rank,max===undefined?'':`${rank} / ${max}`);text(node.badge,record.locked?'未解锁':record.ok?'可升级':record.reason||'');
    node.button.classList.toggle('selected',selected);node.button.classList.toggle('locked',!!record.locked);node.button.classList.toggle('unavailable',!record.ok);
    node.button.setAttribute('aria-pressed',String(selected));node.button.title=record.description||record.reason||record.name||'';
    if(icon)setImage(node.icon,icon);
  }
  show(){this.open=true;this.lastSelection='';this.refresh(true);}
  hide(){this.open=false;}
  setTab(tab){if(!['beacon','workers'].includes(tab))return;this.tab=tab;this.refresh(true);}
  selectBeacon(id){this.selectedBeacon=id;this.refresh(true);}

  refresh(force=false){
    if(!this.open&&!force)return;
    const info=this.game.getBeaconInfo();
    const workerInfo=typeof this.game.getWorkerInfo==='function'?this.game.getWorkerInfo():{roles:[],totalCount:0,totalCap:0};
    this.beaconInfo=info;this.workerInfo=workerInfo;
    text(this.levelText,`信标 Lv.${info.level} / ${info.maxLevel}`);text(this.hpText,`生命 ${Math.ceil(number(info.hp))} / ${number(info.maxHp)}`);
    for(const [id,node] of Object.entries(this.tabButtons)){const active=this.tab===id;node.classList.toggle('active',active);node.setAttribute('aria-selected',String(active));node.tabIndex=active?0:-1;}
    this.beaconView.hidden=this.tab!=='beacon';this.workerView.hidden=this.tab!=='workers';
    this.renderBeacon(info);this.renderWorkers(workerInfo);
    const selection=this.selection();this.renderDetail(selection);
    const key=JSON.stringify([this.tab,selection.id,selection.role]);
    if(key!==this.lastSelection){this.lastSelection=key;this.onSelect({...selection,item:selection.item?{...selection.item}:null});}
  }

  renderBeacon(info){
    const layers=number(info.pyramidLayers);this.layers.forEach((row,index)=>row.classList.toggle('built',index<layers));text(this.pyramidCaption,`${layers} / 4 层基座`);
    const items=info.upgrades||[],ids=new Set(items.map(item=>item.id));
    if(this.selectedBeacon!=='level'&&!ids.has(this.selectedBeacon))this.selectedBeacon='level';
    const level={id:'level',name:'升级信标',description:'',...info.levelUpgrade,rank:info.level,maxRank:info.maxLevel};
    this.levelRecord=level;this.updateOption(this.levelButton,level,this.selectedBeacon==='level','beacon');
    for(const [id,node] of this.abilityNodes)if(!ids.has(id)){node.button.remove();this.abilityNodes.delete(id);}
    for(const item of items){
      let node=this.abilityNodes.get(item.id);
      if(!node){node=this.makeOption(item.id,'beacon-ability',ICONS[item.id]||'beacon');node.button.dataset.beaconUpgrade=item.id;node.button.addEventListener('click',()=>this.selectBeacon(item.id));this.abilityNodes.set(item.id,node);(SECONDARY.has(item.id)?this.secondaryGrid:this.primaryGrid).append(node.button);}
      this.updateOption(node,item,this.selectedBeacon===item.id,ICONS[item.id]||'beacon');
    }
  }

  renderWorkers(info){
    const roles=info.roles||[];
    if(!roles.some(role=>role.role===this.selectedRole)){this.selectedRole=roles[0]?.role||'lumberjack';this.selectedWorker='hire';}
    const roleIds=new Set(roles.map(role=>role.role));
    for(const [id,node] of this.roleNodes)if(!roleIds.has(id)){node.button.remove();this.roleNodes.delete(id);}
    for(const role of roles){
      let node=this.roleNodes.get(role.role);
      if(!node){node=this.makeOption(role.role,'beacon-role',ROLE_ICONS[role.role]||'iron');node.button.dataset.workerRole=role.role;node.button.addEventListener('click',()=>{this.selectedRole=role.role;this.selectedWorker='hire';this.refresh(true);});this.roleNodes.set(role.role,node);this.roleGrid.append(node.button);}
      text(node.name,role.name);text(node.rank,`${number(role.count)} / ${number(role.cap)} 人`);text(node.badge,role.role==='lumberjack'?'斧头独立升级':'镐子独立升级');node.button.classList.toggle('selected',role.role===this.selectedRole);node.button.setAttribute('aria-pressed',String(role.role===this.selectedRole));
    }
    const role=roles.find(item=>item.role===this.selectedRole);this.roleRecord=role;
    const stats=role?.stats||{};text(this.statNodes.speed,number(stats.speed).toFixed(0));text(this.statNodes.work,`${number(stats.workInterval).toFixed(2)} 秒`);text(this.statNodes.duration,`${number(stats.duration).toFixed(0)} 秒`);text(this.statNodes.tool,stats.toolName||'—');
    const hire={id:'hire',name:role?`雇佣${role.name}`:'雇佣村民',description:role?.description||'',...role?.hire};
    this.hireRecord=hire;this.updateOption(this.hireButton,hire,this.selectedWorker==='hire',ROLE_ICONS[this.selectedRole]||'iron');text(this.hireButton.rank,role?`在场 ${role.count} / ${role.cap}`:'');text(this.hireButton.badge,hire.ok?'可雇佣':hire.reason||'暂不可用');
    const upgrades=role?.upgrades||[],ids=new Set(upgrades.map(item=>item.id));
    if(this.selectedWorker!=='hire'&&!ids.has(this.selectedWorker))this.selectedWorker='hire';
    for(const [id,node] of this.workerUpgradeNodes)if(!ids.has(id)){node.button.remove();this.workerUpgradeNodes.delete(id);}
    for(const item of upgrades){
      let node=this.workerUpgradeNodes.get(item.id);
      const icon=item.id==='tool'?(this.selectedRole==='lumberjack'?'iron-axe':`${stats.tool==='wood'?'wooden':stats.tool||'wooden'}-pickaxe`):WORKER_ICONS[item.id]||'beacon';
      if(!node){node=this.makeOption(item.id,'beacon-worker-upgrade',icon);node.button.dataset.workerUpgrade=item.id;node.button.addEventListener('click',()=>{this.selectedWorker=item.id;this.refresh(true);});this.workerUpgradeNodes.set(item.id,node);this.workerGrid.append(node.button);}
      this.updateOption(node,item,this.selectedWorker===item.id,icon);
    }
    text(this.lifeHeading,`在场村民 · 共 ${number(info.totalCount)} / ${number(info.totalCap)}`);
    const alive=(this.game.state.workers||[]).filter(worker=>worker.role===this.selectedRole&&worker.hp>0&&worker.life>0),liveIds=new Set(alive.map(worker=>worker.id));
    for(const [id,node] of this.lifeNodes)if(!liveIds.has(id)){node.row.remove();this.lifeNodes.delete(id);}
    for(const worker of alive){
      let node=this.lifeNodes.get(worker.id);
      if(!node){const row=make('div','beacon-worker-life'),label=make('span'),time=make('strong'),meter=make('progress');row.dataset.workerId=String(worker.id);row.append(label,time,meter);node={row,label,time,meter};this.lifeNodes.set(worker.id,node);this.lifeList.append(row);}
      text(node.label,`${role?.name||'村民'} #${worker.id}`);text(node.time,`${Math.ceil(worker.life)} 秒`);node.meter.max=Math.max(1,number(worker.maxLife,60));node.meter.value=Math.max(0,worker.life);node.meter.setAttribute('aria-label',`${role?.name||'村民'}剩余任期`);
    }
    this.lifeEmpty.hidden=alive.length>0;
  }

  selection(){
    if(this.tab==='beacon')return{tab:'beacon',id:this.selectedBeacon,item:this.selectedBeacon==='level'?this.levelRecord:(this.beaconInfo.upgrades||[]).find(item=>item.id===this.selectedBeacon)};
    return{tab:'workers',role:this.selectedRole,id:this.selectedWorker,item:this.selectedWorker==='hire'?this.hireRecord:this.roleRecord?.upgrades?.find(item=>item.id===this.selectedWorker)};
  }
  check(selection){
    if(selection.tab==='beacon')return this.game.canUpgradeBeacon(selection.id);
    if(!this.roleRecord)return{ok:false,reason:'当前没有可用的雇佣职业',cost:{}};
    return selection.id==='hire'?this.game.canHireWorker(selection.role):this.game.canUpgradeWorker(selection.role,selection.id);
  }
  renderDetail(selection){
    const item=selection.item||{},check=this.check(selection),rank=item.rank??item.level,max=item.maxRank??item.maxLevel;
    const icon=selection.tab==='beacon'?ICONS[selection.id]||'beacon':selection.id==='tool'||selection.id==='hire'?ROLE_ICONS[selection.role]||'iron':WORKER_ICONS[selection.id]||'beacon';
    setImage(this.detailIcon,icon);text(this.detailName,item.name||'选择一项能力');text(this.detailDescription,item.description||'从左侧选择需要升级或雇佣的项目。');
    text(this.detailRank,selection.id==='hire'?`当前 ${number(this.roleRecord?.count)} / ${number(this.roleRecord?.cap)} 人`:rank===undefined?'':`当前等级 ${rank}${max===undefined?'':` / ${max}`}`);
    const costs=check.cost||item.cost||{},entries=Object.entries(costs).filter(([,amount])=>amount>0),ids=new Set(entries.map(([id])=>id));
    for(const [id,node] of this.costNodes)if(!ids.has(id)){node.row.remove();this.costNodes.delete(id);}
    for(const [id,amount] of entries){
      let node=this.costNodes.get(id);const visual=getMaterialVisual(id),have=Math.max(0,number(id==='xp'?this.game.state.xp:this.game.state.materials?.[id]));
      if(!node){const row=make('div','beacon-cost'),icon=image(visual.texture),label=make('span'),count=make('strong');row.dataset.material=id;row.append(icon,label,count);node={row,icon,label,count};this.costNodes.set(id,node);this.costList.append(row);}
      text(node.label,visual.name);text(node.count,`${have} / ${amount}`);node.row.classList.toggle('missing',have<amount);
    }
    this.costEmpty.hidden=entries.length>0;text(this.costEmpty,check.ok?'无需材料。':'');
    const allowed=!!check.ok&&!check.locked;this.confirm.disabled=!allowed;
    text(this.confirm,selection.id==='hire'?'确认雇佣':selection.id==='level'?'升级信标':selection.id==='tool'?(selection.role==='lumberjack'?'升级斧头':'升级镐子'):'确认升级');
    text(this.reason,check.reason||(allowed?'材料齐全，确认后消耗材料。':'暂时无法操作。'));this.reason.classList.toggle('blocked',!allowed);
  }
  act(){
    const selection=this.selection(),check=this.check(selection);
    if(!check.ok||check.locked){this.notify(check.reason||'当前不能操作');this.refresh(true);return;}
    const success=selection.tab==='beacon'?this.game.upgradeBeacon(selection.id):selection.id==='hire'?this.game.hireWorker(selection.role):this.game.upgradeWorker(selection.role,selection.id);
    if(!success){const fresh=this.check(selection);this.notify(fresh.reason||'本次操作未完成');this.refresh(true);return;}
    this.notify(selection.id==='hire'?`已雇佣：${this.roleRecord?.name||'村民'}`:`已升级：${selection.item?.name||'信标能力'}`);
    this.onAction({...selection,item:selection.item?{...selection.item}:null});this.refresh(true);
  }
}
