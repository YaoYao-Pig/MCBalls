import { UPGRADES, RODS, describeBall } from './core.js';

const $ = id => document.getElementById(id);
const traitNames = { iron:'铁质重击', storm:'连锁闪电', frost:'寒冰减速', gold:'黄金诱饵', slime:'粘液弹性' };
const targetValue = target => `${target.kind}:${target.id}`;
function parseTarget(value) {
  const [kind,id]=value.split(':');return {kind,id:kind==='ball'?Number(id):id};
}
function image(name) {const img=document.createElement('img');img.src=new URL(`../assets/minecraft/${name}.png`,import.meta.url).href;img.alt='';return img;}

/** UI only: all costs, gates and equipment mutations are validated by Game. */
export class WorkbenchPanel {
  constructor(game,{notify,onAction}) {
    this.game=game;this.notify=notify;this.onAction=onAction;this.kind=null;this.tab='add';this.key='';
    $('enchant-target').addEventListener('change',()=>this.refresh(true));
    for(const button of document.querySelectorAll('[data-station-tab]'))button.addEventListener('click',()=>{this.tab=button.dataset.stationTab;this.refresh(true);});
    $('enchant-action').addEventListener('click',()=>this.applyEnchant());
    $('fusion-a').addEventListener('change',()=>this.refreshFusion());$('fusion-b').addEventListener('change',()=>this.refreshFusion());
    $('fusion-action').addEventListener('click',()=>{
      const a=Number($('fusion-a').value),b=Number($('fusion-b').value),check=this.game.canFuse(a,b);
      if(this.game.fuseBlocks(a,b)){this.notify(`融合完成：${check.name||'强化方块'}`);this.onAction();this.refresh(true);}
      else this.notify(check.reason||'暂时不能融合');
    });
  }
  show(kind) {this.kind=kind;this.tab=kind==='enchantingTable'?'random':'add';this.key='';this.refresh(true);}
  refresh(force=false) {
    if(!this.kind)return;
    const s=this.game.state;
    const key=JSON.stringify([this.kind,this.tab,s.xp,s.books,s.ownedRods,s.rodEnchantments,s.baseEnchantments,s.balls.map(b=>[b.id,b.type,b.traits,b.fusionLevel,b.enchantments,b.heldBy])]);
    if(!force&&key===this.key)return;this.key=key;
    $('station-title').textContent=this.kind==='enchantingTable'?'附魔台':'铁砧';
    $('station-caption').textContent=this.kind==='enchantingTable'?'图书管理员 · 用经验改变装备':'工具匠 · 保留、叠加与融合';
    $('station-xp').textContent=`可用经验 ${s.xp}`;
    $('station-tabs').hidden=this.kind==='enchantingTable';
    document.querySelectorAll('[data-station-tab]').forEach(button=>button.classList.toggle('active',button.dataset.stationTab===this.tab));
    const fusion=this.tab==='fusion';$('enchant-body').hidden=fusion;$('fusion-body').hidden=!fusion;
    if(fusion){this.populateFusion();return;}
    const options=[];
    for(const rod of RODS)if(s.ownedRods.includes(rod.id))options.push({value:`rod:${rod.id}`,name:`球杆 · ${rod.name}`});
    for(const ball of s.balls)if(ball.type!=='ghost'&&ball.life===undefined)options.push({value:`ball:${ball.id}`,name:`方块 #${ball.id} · ${describeBall(ball).name}`});
    const select=$('enchant-target'),previous=select.value||`rod:${s.activeRod}`;select.replaceChildren();
    for(const option of options){const node=document.createElement('option');node.value=option.value;node.textContent=option.name;select.append(node);}
    if(options.some(o=>o.value===previous))select.value=previous;
    const target=parseTarget(select.value),info=this.game.describeEnchantTarget(target);
    const current=$('current-enchants');current.replaceChildren();
    const enchants=Object.entries(info.enchantments||{});
    if(!enchants.length){const empty=document.createElement('p');empty.className='station-empty';empty.textContent='这件装备尚无附魔。';current.append(empty);}
    for(const [id,level] of enchants){const spec=UPGRADES.find(u=>u.id===id);const row=document.createElement('div');row.className='enchant-chip';const name=document.createElement('b');name.textContent=`${spec?.name||id} ${level}`;const desc=document.createElement('small');desc.textContent=spec?.description||'';row.append(name,desc);current.append(row);}
    $('enchant-slot-count').textContent=`${enchants.length} / 4 项`;
    const bookMode=this.tab==='book';$('book-choices').hidden=!bookMode;$('enchant-action-area').hidden=bookMode;
    if(bookMode){this.populateBooks(target);return;}
    const mode=this.kind==='enchantingTable'?'random':'add',check=this.game.canEnchant(target,mode);
    $('enchant-mode-name').textContent=mode==='random'?'随机附魔':'增量附魔';
    $('enchant-mode-description').textContent=mode==='random'?'重洗当前选中的装备：覆盖它原有的附魔，随机生成两项。其他装备不变。':'保留当前装备的附魔，增加一项或提升等级。最多四种附魔。';
    $('enchant-action').textContent=`${mode==='random'?'随机重洗':'增加附魔'} · ${check.cost??(mode==='random'?8:10)} 经验`;
    $('enchant-action').disabled=!check.ok;$('enchant-reason').textContent=check.ok?'只消耗经验，不消耗材料。':check.reason;
  }
  applyEnchant(bookId) {
    const target=parseTarget($('enchant-target').value),mode=bookId?'book':this.kind==='enchantingTable'?'random':'add';
    const check=this.game.canEnchant(target,mode,bookId);
    if(this.game.enchant(target,mode,bookId)){this.notify(bookId?'附魔书已应用到选中的装备':'附魔完成');this.onAction();this.refresh(true);}
    else this.notify(check.reason||'暂时无法附魔');
  }
  populateBooks(target) {
    const container=$('book-choices');container.replaceChildren();
    const books=Object.entries(this.game.state.books).filter(([id,count])=>count>0&&UPGRADES.find(item=>item.id===id)?.category!=='base');
    if(!books.length){const p=document.createElement('p');p.className='station-empty';p.textContent='还没有附魔书。击杀怪物可能掉落，村民也会随机出售。';container.append(p);return;}
    for(const [id,count] of books){
      const spec=UPGRADES.find(u=>u.id===id),check=this.game.canEnchant(target,'book',id);
      const button=document.createElement('button');button.className='book-card';button.disabled=!check.ok;button.append(image('enchanted-book'));
      const body=document.createElement('div'),title=document.createElement('b'),desc=document.createElement('small');title.textContent=`${spec?.name||id} ×${count}`;desc.textContent=check.ok?`定向添加 · ${check.cost??3} 经验`:(check.reason||'不可用于这件装备');body.append(title,desc);button.append(body);
      button.title=spec?.description||'';button.addEventListener('click',()=>this.applyEnchant(id));container.append(button);
    }
  }
  populateFusion(){
    const balls=this.game.state.balls.filter(b=>b.type!=='ghost'&&b.life===undefined);
    for(const [index,id] of ['fusion-a','fusion-b'].entries()){
      const select=$(id),previous=Number(select.value);select.replaceChildren();
      for(const ball of balls){const option=document.createElement('option');option.value=ball.id;option.textContent=`#${ball.id} · ${describeBall(ball).name}${ball.heldBy?'（被抓住）':''}`;select.append(option);}
      if(balls.some(b=>b.id===previous))select.value=String(previous);else if(balls[index])select.value=String(balls[index].id);
    }
    this.refreshFusion();
  }
  refreshFusion(){
    const a=Number($('fusion-a').value),b=Number($('fusion-b').value),check=this.game.canFuse(a,b);
    $('fusion-action').disabled=!check.ok;
    $('fusion-result-name').textContent=check.name||'选择两块不同的方块';
    $('fusion-result-traits').textContent=check.traits?.length?check.traits.map(t=>traitNames[t]||t).join(' ＋ '):'融合后继承双方原生特性与附魔，同名附魔取较高等级。';
    $('fusion-reason').textContent=check.ok?'消耗选中的两块，保留一块更强的融合方块。包含草方块时保留其召回能力。':check.reason||'需要两块永久方块，可以先按 C 合成。';
  }
}
