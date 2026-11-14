const textures={cue:'grass-side',iron:'iron',storm:'redstone',frost:'ice',gold:'gold',slime:'slime-block',tnt:'tnt-side'};
const text=(node,value)=>{const next=String(value??'');if(node.textContent!==next)node.textContent=next;};

/** The core retains the free choice until a valid target is confirmed. This
 * panel previews that transaction and never applies or prices upgrades itself. */
export class UpgradeTargetPanel {
  constructor(game,{container,onSelected=()=>{},onCancel=()=>{},notify=()=>{}}={}){
    this.game=game;this.container=container||document.getElementById('upgrade-target-panel');
    if(!this.container)throw new Error('UpgradeTargetPanel needs a container');
    this.document=this.container.ownerDocument;this.onSelected=onSelected;this.onCancel=onCancel;this.notify=notify;
    this.rows=new Map();this.targets=[];this.active=false;
    const make=(tag,className,content)=>{const node=this.document.createElement(tag);node.className=className;if(content)node.textContent=content;return node;};
    this.container.classList.add('upgrade-target-panel');this.container.hidden=true;
    this.instruction=make('div','upgrade-target-instruction');this.instruction.setAttribute('role','status');
    this.title=make('strong','','选择一个方块成为炮台');
    this.instruction.append(this.title,make('small','','战场已暂停 · 点击绿色轮廓方块，或选择下方卡片'));
    this.tray=make('section','upgrade-target-tray');this.tray.setAttribute('aria-label','炮台升级目标');
    this.list=make('div','upgrade-target-list');this.empty=make('p','upgrade-target-empty','目前没有可升级的方块，可以返回三选一选择其他强化。');
    const footer=make('div','upgrade-target-footer');
    footer.append(make('small','','确认后消耗这次免费强化 · 按 1–9 选择对应方块'));
    this.back=make('button','upgrade-target-back','返回三选一 · Esc');this.back.type='button';this.back.addEventListener('click',()=>this.cancel());footer.append(this.back);
    this.tray.append(this.list,this.empty,footer);this.container.replaceChildren(this.instruction,this.tray);
  }

  get eligibleIds(){return this.active?this.targets.filter(target=>target.ok).map(target=>target.id):[];}

  update(){
    const active=this.game.state.phase==='upgrade'&&this.game.state.upgradeTarget==='stationary_turret';
    const entering=active&&!this.active;this.active=active;this.container.hidden=!active;
    if(!active){this.targets=[];return;}
    this.targets=this.game.getUpgradeTargets();this.empty.hidden=this.targets.some(target=>target.ok);
    const ids=new Set();let next=this.list.firstElementChild;
    this.targets.forEach((target,index)=>{
      const id=target.id;ids.add(id);let row=this.rows.get(id);
      if(!row){
        const button=this.document.createElement('button');button.type='button';button.className='upgrade-target-card';button.dataset.ballId=String(id);
        const icon=this.document.createElement('img');icon.alt='';
        const body=this.document.createElement('span'),name=this.document.createElement('b'),detail=this.document.createElement('small');body.append(name,detail);
        const key=this.document.createElement('kbd');button.append(icon,body,key);
        button.addEventListener('click',()=>this.select(id));row={button,icon,name,detail,key};this.rows.set(id,row);
      }
      const ball=this.game.state.balls.find(candidate=>candidate.id===id),texture=textures[ball?.type]||textures[target.traits?.[0]]||'grass-side';
      const url=new URL(`../assets/minecraft/${texture}.png`,import.meta.url).href;if(row.icon.src!==url)row.icon.src=url;
      text(row.name,`${target.name} · 方块 ${index+1}`);
      text(row.detail,target.ok?target.level>0?`炮台 ${target.level} → ${target.nextLevel} 级`:'改造为蓄力光束炮台':target.reason);
      text(row.key,index<9?index+1:'');row.key.hidden=index>=9;row.button.disabled=!target.ok;
      row.button.setAttribute('aria-label',`${target.name}，方块 ${index+1}，${target.ok?target.level>0?`升级到炮台 ${target.nextLevel} 级`:'转为炮台':target.reason}`);
      if(row.button!==next)this.list.insertBefore(row.button,next);next=row.button.nextElementSibling;
    });
    for(const [id,row]of this.rows)if(!ids.has(id)){row.button.remove();this.rows.delete(id);}
    if(entering)this.back.focus({preventScroll:true});
  }

  select(ballId){
    if(!this.active)return false;
    const check=this.game.canChooseUpgradeTarget(ballId);
    if(!check.ok){this.notify(check.reason||'这个方块暂时不能变成炮台');this.update();return false;}
    if(!this.game.chooseUpgradeTarget(ballId)){this.notify('目标状态已变化，请重新选择');this.update();return false;}
    this.update();this.onSelected(ballId);return true;
  }

  cancel(){if(!this.active||!this.game.cancelUpgradeTarget())return false;this.update();this.onCancel();return true;}

  handleKey(event){
    if(!this.active||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return false;
    if(event.key==='Escape'){event.preventDefault();this.cancel();return true;}
    if(/^[1-9]$/.test(event.key)){event.preventDefault();const target=this.targets[Number(event.key)-1];if(target)this.select(target.id);return true;}
    return false;
  }
}
