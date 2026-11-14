const GRADES = new Set(['steady','moving','swift','perfect']);
const PHRASES = Object.freeze({
  steady: Object.freeze(['灵巧回接','精巧接球']),
  moving: Object.freeze(['精巧接球','漂亮截击','灵巧回接']),
  swift: Object.freeze(['漂亮截击','绝妙衔接']),
  perfect: Object.freeze(['绝妙衔接','精巧接球']),
});
const text = (element,value) => { const next=String(value);if(element.textContent!==next)element.textContent=next; };
const percent = value => `${Math.round(value*1000)/10}%`;
const finite = value => typeof value==='number'&&Number.isFinite(value);

function payload(value){
  if(!value||value.ballId===null||value.ballId===undefined||!GRADES.has(value.grade))return null;
  if(!finite(value.caughtSpeed)||value.caughtSpeed<=0)return null;
  if(!finite(value.damageBonus)||value.damageBonus<0||!finite(value.speedBonus)||value.speedBonus<0)return null;
  if(!Number.isInteger(value.streak)||value.streak<1)return null;
  return {ballId:value.ballId,caughtSpeed:value.caughtSpeed,damageBonus:value.damageBonus,speedBonus:value.speedBonus,streak:value.streak,grade:value.grade,precise:value.precise===true,pending:value.pending!==false};
}

/** UI only. Catch rewards and slow time are read from Game, never calculated
 * here. update() does not choose phrases or start/extend timeout callbacks. */
export class AimFeedback {
  constructor({container=null,statusContainer=null,reducedMotion=null,random=Math.random,durationMs=1000,now=()=>globalThis.performance?.now?.()??Date.now(),schedule=(fn,delay)=>globalThis.setTimeout(fn,delay),cancel=id=>globalThis.clearTimeout(id)}={}){
    const doc=container?.ownerDocument||statusContainer?.ownerDocument||globalThis.document;
    this.container=container||doc?.getElementById('aim-feedback');
    this.statusContainer=statusContainer||doc?.getElementById('slow-time-status');
    if(!this.container||!this.statusContainer)throw new Error('AimFeedback requires #aim-feedback and #slow-time-status');
    this.random=random;this.now=now;this.schedule=schedule;this.cancel=cancel;
    this.durationMs=finite(durationMs)?Math.min(3000,Math.max(150,durationMs)):1000;
    this.reducedMotion=reducedMotion===null?!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches:!!reducedMotion;
    this.current=null;this.timer=null;this.deadline=0;this.generation=0;this.disposed=false;this.seen=new WeakSet();
    const make=(tag,className)=>{const element=doc.createElement(tag);element.className=className;return element;};
    this.container.classList.add('aim-feedback');this.container.hidden=true;this.container.setAttribute('aria-live','polite');this.container.setAttribute('aria-atomic','true');
    this.container.dataset.reducedMotion=String(this.reducedMotion);
    this.caption=make('small','aim-feedback-caption');this.title=make('strong','aim-feedback-title');this.details=make('span','aim-feedback-details');
    this.damage=make('b','aim-feedback-damage');this.speed=make('span','aim-feedback-speed');this.streak=make('span','aim-feedback-streak');
    this.caption.dataset.catchSpeed='';this.title.dataset.catchTitle='';this.damage.dataset.catchDamage='';this.speed.dataset.catchVelocityBonus='';this.streak.dataset.catchStreak='';
    this.details.append(this.damage,this.speed,this.streak);this.container.replaceChildren(this.caption,this.title,this.details);
    this.statusContainer.classList.add('slow-time-status');this.statusContainer.hidden=true;
    const label=make('span','slow-time-label');label.textContent='世界速度';this.timeScale=make('strong','slow-time-value');this.timeScale.dataset.timeScale='';
    this.meter=make('span','slow-time-track');this.meter.setAttribute('role','progressbar');this.meter.setAttribute('aria-label','世界时间流速');this.meter.setAttribute('aria-valuemin','0');this.meter.setAttribute('aria-valuemax','100');
    this.meterFill=make('i','slow-time-fill');this.meter.append(this.meterFill);this.statusContainer.replaceChildren(label,this.timeScale,this.meter);
  }

  showCatch(event){
    if(this.disposed)return false;
    if(event?.type==='catchShot')return this.confirmShot(event);
    const data=event?.type==='catch'?payload(event):null;
    if(!data||this.seen.has(event))return false;
    this.seen.add(event);this.clearTimer();
    const choices=PHRASES[data.grade];let sample;
    try{sample=this.random();}catch{sample=0;}
    const bounded=finite(sample)?Math.max(0,Math.min(1-Number.EPSILON,sample)):0;
    text(this.title,choices[Math.floor(bounded*choices.length)]);
    this.current={...data,pending:true};this.container.dataset.side='center';this.writeCatch();
    this.container.hidden=false;this.container.classList.remove('is-active');
    if(!this.reducedMotion)void this.container.offsetWidth;
    this.container.classList.add('is-active');
    const stamp=++this.generation;this.deadline=this.now()+this.durationMs;
    this.timer=this.schedule(()=>{if(stamp!==this.generation||this.disposed)return;this.timer=null;this.hideCatch();},this.durationMs);
    return true;
  }

  /** A real catchShot can change 'next shot' to 'this shot'. It never creates
   * another popup, rerolls its caption, or extends the existing display time. */
  confirmShot(event){
    const data=event?.type==='catchShot'?payload(event):null;
    if(this.disposed||!data||!this.current||data.ballId!==this.current.ballId)return false;
    if(this.now()>=this.deadline){this.hideCatch();return false;}
    this.current={...data,pending:false};this.writeCatch();return true;
  }

  writeCatch(){
    const info=this.current;if(!info)return;
    this.container.dataset.grade=info.grade;this.container.dataset.precise=String(info.precise);this.container.dataset.pending=String(info.pending);
    text(this.caption,`接速 ${Math.round(info.caughtSpeed)}`);
    text(this.damage,`${info.pending?'下一击':'本杆'}增伤 +${percent(info.damageBonus)}`);
    text(this.speed,`出速 +${percent(info.speedBonus)}`);text(this.streak,`连段 ${info.streak}`);
  }

  update(aimInfo,{visible=true,avoidPoint=null}={}){
    if(this.disposed)return;
    if(!visible){this.reset();return;}
    if(this.current&&this.now()>=this.deadline)this.hideCatch();
    const scale=aimInfo?.timeScale;
    const active=aimInfo?.active===true&&finite(scale)&&scale>=0&&scale<=1;
    this.statusContainer.hidden=!active;
    if(active){
      text(this.timeScale,`×${scale.toFixed(2)}`);this.meterFill.style.width=`${scale*100}%`;
      this.meter.setAttribute('aria-valuenow',String(Math.round(scale*100)));this.meter.setAttribute('aria-valuetext',`世界速度 ${scale.toFixed(2)} 倍`);
      const current=payload(aimInfo);
      if(current&&this.current?.pending&&current.ballId===this.current.ballId){this.current={...current,pending:true};this.writeCatch();}
    }
    if(this.current&&avoidPoint)this.avoid(avoidPoint);
  }

  avoid(point){
    if(!finite(point.x)||!finite(point.y)||this.container.dataset.side!=='center')return;
    const parent=this.container.parentElement;if(!parent)return;
    const width=parent.clientWidth||parent.getBoundingClientRect().width;
    if(width<=0)return;
    const bannerWidth=this.container.offsetWidth||Math.min(270,width*.58),bannerHeight=this.container.offsetHeight||72;
    const bannerTop=this.container.offsetTop||12;
    if(point.y<bannerTop+bannerHeight+24&&Math.abs(point.x-width/2)<bannerWidth/2+35){
      // At most one anchor change per popup: do not chase the pointer every
      // frame. Coordinates are relative to the arena, supplied by the caller.
      this.container.dataset.side=point.x<=width/2?'right':'left';
    }
  }

  clearTimer(){if(this.timer!==null){this.cancel(this.timer);this.timer=null;}}
  hideCatch(){this.clearTimer();this.generation++;this.current=null;this.deadline=0;this.container.hidden=true;this.container.classList.remove('is-active');}
  reset(){
    this.hideCatch();this.statusContainer.hidden=true;
    for(const node of [this.caption,this.title,this.damage,this.speed,this.streak,this.timeScale])text(node,'');
    this.meterFill.style.width='0%';this.meter.setAttribute('aria-valuenow','0');this.meter.removeAttribute('aria-valuetext');
    for(const key of ['grade','precise','pending','side'])delete this.container.dataset[key];
  }
  dispose(){if(this.disposed)return;this.reset();this.disposed=true;}
}
