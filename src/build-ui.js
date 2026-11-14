const EFFECT_ICONS = Object.freeze({fire_aspect:'fire-charge',frost_touch:'ice',frost:'ice',stationary_turret:'beacon',earthshatter:'iron',prism:'diamond',gravity_mark:'ender-pearl',echo:'end-rod',storm:'redstone',storm_link:'lightning-rod',steam_burst:'blaze-powder',iron:'iron',gold:'gold',slime:'slime-block'});
const ROD_ICONS = Object.freeze({wood:'stick',bone:'bone',end:'end-rod',blaze:'blaze-rod'});
const asset = name => new URL(`../assets/minecraft/${name}.png`,import.meta.url).href;
const text = (node,value) => {const next=String(value??'');if(node.textContent!==next)node.textContent=next;};
let nextId=0;

/** A read-only view of Game.getBuildInfo. It neither equips items nor derives
 * damage, levels, ownership or combo conditions from raw Game state. */
export class BuildPanel {
  constructor(game,{container=null,expanded=false,onToggle=()=>{}}={}){
    this.game=game;this.container=container||globalThis.document?.getElementById('build-panel');
    if(!this.container)throw new Error('BuildPanel requires #build-panel');
    if(typeof game?.getBuildInfo!=='function')throw new Error('BuildPanel requires Game.getBuildInfo');
    this.document=this.container.ownerDocument;this.onToggle=onToggle;this.initialExpanded=!!expanded;this.expanded=!!expanded;this.disposed=false;
    this.effectNodes=new Map();this.comboNodes=new Map();this.info=null;
    this.container.classList.add('build-panel');this.container.hidden=true;
    this.toggle=this.make('button','build-toggle');this.toggle.type='button';this.toggle.dataset.buildToggle='';
    this.toggleIcon=this.make('img','build-toggle-icon');this.toggleIcon.alt='';this.toggleIcon.src=asset('enchanted-book');
    const caption=this.make('span','build-toggle-caption');this.title=this.make('strong','','当前构筑');this.subtitle=this.make('small','','选择一个持久方块');caption.append(this.title,this.subtitle);
    this.badge=this.make('span','build-combo-count','0');this.arrow=this.make('span','build-toggle-arrow','⌄');this.arrow.setAttribute('aria-hidden','true');
    this.toggle.append(this.toggleIcon,caption,this.badge,this.arrow);
    this.body=this.make('div','build-body');this.body.id=`build-body-${++nextId}`;this.body.setAttribute('role','region');this.body.setAttribute('aria-label','当前方块实际生效的构筑');this.toggle.setAttribute('aria-controls',this.body.id);
    this.loadout=this.make('div','build-loadout');this.ball=this.make('strong','build-ball-name');this.rod=this.make('span','build-rod-name');this.rodIcon=this.make('img','build-rod-icon');this.rodIcon.alt='';this.mode=this.make('b','build-mode');
    const rodLine=this.make('div','build-rod-line');rodLine.append(this.rodIcon,this.rod);this.loadout.append(this.ball,rodLine,this.mode);
    this.summary=this.make('p','build-summary');
    this.comboHeading=this.make('h3','build-group-heading','已成型组合');this.comboList=this.make('div','build-combos');this.comboList.dataset.buildCombos='';this.comboEmpty=this.make('p','build-empty','尚未形成组合；获得不同流派后可互相配合。');
    this.effectHeading=this.make('h3','build-group-heading','实际生效效果');this.effectList=this.make('div','build-effects');this.effectList.dataset.buildEffects='';this.effectEmpty=this.make('p','build-empty','当前方块还没有流派效果，附魔或本局升级后会显示在这里。');
    this.note=this.make('p','build-note','查看构筑时战斗继续；已射出的攻击保留出杆时的附魔。');
    this.comboSection=this.make('section','build-combo-section');this.comboSection.append(this.comboHeading,this.comboList,this.comboEmpty);
    this.effectSection=this.make('section','build-effect-section');this.effectSection.append(this.effectHeading,this.effectList,this.effectEmpty);
    this.lists=this.make('div','build-lists');this.lists.append(this.comboSection,this.effectSection);
    this.body.append(this.loadout,this.summary,this.lists,this.note);
    this.container.replaceChildren(this.toggle,this.body);
    this.handleToggle=()=>this.setExpanded(!this.expanded);this.toggle.addEventListener('click',this.handleToggle);
    this.handleKey=event=>{if(event.key==='Escape'&&this.expanded){event.preventDefault();event.stopPropagation();this.setExpanded(false);this.toggle.focus();}};
    this.container.addEventListener('keydown',this.handleKey);
    this.applyExpanded();
  }

  make(tag,className,content){const node=this.document.createElement(tag);if(className)node.className=className;if(content!==undefined)node.textContent=content;return node;}

  applyExpanded(){this.body.hidden=!this.expanded;this.container.dataset.expanded=String(this.expanded);this.toggle.setAttribute('aria-expanded',String(this.expanded));text(this.arrow,this.expanded?'⌃':'⌄');}

  setExpanded(value){if(this.disposed)return;const next=!!value;if(next===this.expanded)return;this.expanded=next;this.applyExpanded();this.onToggle(next);}

  reconcile(items,nodes,list,kind){
    const ids=new Set();let before=list.firstElementChild;
    for(const item of items){
      if(typeof item.id!=='string'||!item.id||ids.has(item.id))continue;ids.add(item.id);
      let record=nodes.get(item.id);
      if(!record){
        const node=this.make('article',kind==='effect'?'build-effect':'build-combo');node.dataset[kind==='effect'?'buildEffect':'buildCombo']=item.id;
        const heading=this.make('div','build-item-heading'),name=this.make('strong'),level=this.make('b','build-effect-level'),source=this.make('small','build-effect-source'),description=this.make('p');
        if(kind==='effect'){const icon=this.make('img','build-effect-icon');icon.alt='';icon.src=asset(EFFECT_ICONS[item.id]||'book');heading.append(icon);}
        heading.append(name,level);node.append(heading,source,description);record={node,name,level,source,description};nodes.set(item.id,record);
      }
      text(record.name,item.name||item.id);text(record.level,kind==='effect'&&Number.isFinite(item.level)?`Lv.${item.level}`:'');record.level.hidden=kind!=='effect'||!Number.isFinite(item.level);
      text(record.source,item.source||'');record.source.hidden=kind!=='effect'||!item.source;text(record.description,item.description||'');record.description.hidden=!item.description;
      record.node.dataset.active='true';
      if(record.node!==before)list.insertBefore(record.node,before);before=record.node.nextElementSibling;
    }
    for(const [id,record]of nodes)if(!ids.has(id)){record.node.remove();nodes.delete(id);}
  }

  update(ballId=null,{visible=true}={}){
    if(this.disposed)return null;
    this.container.hidden=!visible;if(!visible)return this.info;
    const info=this.game.getBuildInfo(ballId);this.info=info;
    if(!info||info.ballId===null||info.ballId===undefined){
      text(this.title,'当前构筑');text(this.subtitle,'选择一个持久方块');text(this.ball,'未选择方块');text(this.rod,'');this.rodIcon.hidden=true;text(this.mode,'');text(this.summary,'选择方块后查看实际生效效果。');
    }else{
      text(this.title,info.ballName||'当前方块');text(this.ball,info.ballName||'当前方块');text(this.rod,`生效球杆：${info.rodName||'未知'}`);
      const rodIcon=ROD_ICONS[info.rodId]||'stick';if(this.rodIcon.dataset.texture!==rodIcon){this.rodIcon.dataset.texture=rodIcon;this.rodIcon.src=asset(rodIcon);}this.rodIcon.hidden=false;
      text(this.mode,info.mode==='beam'?'蓄力光束':'方块弹射');text(this.summary,info.summary||'');
    }
    const available=info?.ballId!==null&&info?.ballId!==undefined;
    const effects=available&&Array.isArray(info.effects)?info.effects.filter(item=>item?.active===true):[];
    const combos=available&&Array.isArray(info.combos)?info.combos.filter(item=>item?.active===true):[];
    this.reconcile(effects,this.effectNodes,this.effectList,'effect');this.reconcile(combos,this.comboNodes,this.comboList,'combo');
    const effectCount=this.effectNodes.size,comboCount=this.comboNodes.size;
    if(available)text(this.subtitle,`${info.rodName||'球杆'} · ${effectCount} 项效果`);
    text(this.badge,comboCount>0?`${comboCount} 组合`:'构筑');this.badge.dataset.formed=String(comboCount>0);
    this.comboEmpty.hidden=comboCount>0;this.effectEmpty.hidden=effectCount>0;text(this.comboHeading,`已成型组合 · ${comboCount}`);text(this.effectHeading,`实际生效效果 · ${effectCount}`);
    return info;
  }

  reset(){if(this.disposed)return;this.info=null;this.effectNodes.clear();this.comboNodes.clear();this.effectList.replaceChildren();this.comboList.replaceChildren();this.container.hidden=true;this.expanded=this.initialExpanded;this.applyExpanded();}

  dispose(){if(this.disposed)return;this.reset();this.toggle.removeEventListener('click',this.handleToggle);this.container.removeEventListener('keydown',this.handleKey);this.disposed=true;}
}
