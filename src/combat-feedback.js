const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function damageStyle(event = {}) {
  const mining = event.target === 'resource';
  const combo = mining ? 0 : Math.max(0, Number(event.combo) || 0);
  const tier = combo >= 30 ? 3 : combo >= 12 ? 2 : combo >= 5 ? 1 : 0;
  return {
    combo, tier, mining,
    size: mining ? 13 : Math.min(41, 15 + Math.sqrt(combo) * 2.8 + (event.crit ? 5 : 0)),
    color: event.shield ? '#c9b2ff' : mining ? '#d8d9c4' : event.crit ? '#fff0a1' : tier >= 2 ? '#ffbe50' : tier ? '#ffe4a1' : '#fff8de',
    flames: !mining && !event.shield && (event.burning || tier >= 2),
    label: event.shield ? '格挡' : event.crit ? '暴击' : combo >= 5 ? `${combo} 连击` : '',
  };
}

/** Cosmetic state only. A short, rate-limited hit stop is consumed by the app;
 * this module never edits Game or equipment state. */
export class CombatFeedback {
  constructor({ reducedMotion = false, random = Math.random } = {}) {
    this.reducedMotion = reducedMotion; this.random = random; this.reset();
  }
  reset() { this.texts=[]; this.sparks=[]; this.flashes=[]; this.time=0; this.shake=0; this.hitStop=0; this.stopCooldown=0; this.lastComboAccent=0; }
  consumeHitStop(dt) {
    if(!Number.isFinite(dt)||dt<=0)return 0;
    const stopped=Math.min(dt,this.hitStop);this.hitStop=Math.max(0,this.hitStop-dt);return dt-stopped;
  }
  impact(event) {
    if(!(event.value>0)||!Number.isFinite(event.x)||!Number.isFinite(event.y))return;
    const style=damageStyle(event), seed=this.random()*100;
    this.texts.push({x:event.x,y:event.y,value:Math.max(1,Math.round(event.value)),age:0,life:style.mining?.65:.82+style.tier*.12,seed,tilt:this.reducedMotion?0:(this.random()-.5)*.44,crit:!!event.crit,...style});
    if(this.texts.length>32)this.texts.shift();
    const color=event.shield?'#b6b4ff':style.mining?'#b7b4a0':event.burning?'#ff9b46':style.tier?'#ffdb7a':'#fff2c7';
    this.flashes.push({x:event.x,y:event.y,age:0,life:.16,radius:style.mining?10:17+style.tier*6,color,angle:Number(event.angle)||seed});
    if(this.flashes.length>24)this.flashes.shift();
    this.emitSparks(event.x,event.y,color,style.mining?5:8+style.tier*3,style.mining?65:115+style.tier*30,event.angle);
    if(!style.mining&&!this.reducedMotion){
      this.shake=Math.min(5,Math.max(this.shake,.6+style.tier*.8+(event.crit?1.4:0)));
      if(this.stopCooldown<=0&&(event.crit||style.combo>=5)){
        this.hitStop=Math.min(.055,.018+style.tier*.009+(event.crit?.01:0));this.stopCooldown=.22;
      }
    }
    const accent=style.combo>=5?Math.floor(style.combo/5):0;
    const milestone=accent>this.lastComboAccent;
    this.lastComboAccent=accent;
    return { ...style, milestone };
  }
  emitSparks(x,y,color,count=10,speed=130,direction) {
    for(let i=0;i<count&&this.sparks.length<220;i++){
      const angle=Number.isFinite(direction)?direction+(this.random()-.5)*2.7:this.random()*Math.PI*2;
      const velocity=speed*(.35+this.random()*.75);
      this.sparks.push({x,y,z:20,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity,vz:35+this.random()*100,age:0,life:.23+this.random()*.3,size:1.5+this.random()*2.8,color});
    }
  }
  burst(x,y,color='#ffc46b',strength=1) {
    this.emitSparks(x,y,color,Math.round(15*strength),170*strength);
    if(!this.reducedMotion)this.shake=Math.max(this.shake,Math.min(5,2*strength));
  }
  update(dt) {
    if(!Number.isFinite(dt)||dt<=0)return;
    this.time+=dt;this.stopCooldown=Math.max(0,this.stopCooldown-dt);this.shake*=Math.exp(-17*dt);
    for(const text of this.texts)text.age+=dt;
    for(const flash of this.flashes)flash.age+=dt;
    for(const p of this.sparks){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=240*dt;p.vx*=Math.exp(-3*dt);p.vy*=Math.exp(-3*dt);}
    this.texts=this.texts.filter(t=>t.age<t.life);this.flashes=this.flashes.filter(f=>f.age<f.life);this.sparks=this.sparks.filter(p=>p.age<p.life);
  }
  offset(enabled=true) {
    if(!enabled||this.reducedMotion)return{x:0,y:0};
    return{x:Math.sin(this.time*113)*this.shake,y:Math.cos(this.time*137)*this.shake*.6};
  }
  draw(ctx,project,width=1000) {
    const scale=clamp(width/900,.68,1.15);
    ctx.save();
    for(const p of this.sparks){
      const pos=project(p.x,p.y,Math.max(1,p.z));ctx.globalAlpha=Math.min(1,(1-p.age/p.life)*2);ctx.fillStyle=p.color;
      const size=p.size*scale;ctx.fillRect(pos.x-size/2,pos.y-size/2,size,size);
    }
    for(const flash of this.flashes){
      const pos=project(flash.x,flash.y,30),a=flash.age/flash.life,r=flash.radius*scale*(.7+a);
      ctx.save();ctx.translate(pos.x,pos.y);ctx.rotate(flash.angle);ctx.globalAlpha=(1-a)*.95;ctx.strokeStyle=flash.color;ctx.lineWidth=(1-a)*3+.5;
      for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.beginPath();ctx.moveTo(r*.35,0);ctx.lineTo(r,0);ctx.stroke();}ctx.restore();
    }
    // Draw later labels higher when several impacts share the same target.
    const occupied=[];
    for(const text of this.texts){
      const progress=text.age/text.life,pos=project(text.x,text.y,45),font=text.size*scale;
      let y=pos.y-text.age*(text.mining?28:48)*scale;
      for(let tries=0;tries<5&&occupied.some(p=>Math.abs(p.x-pos.x)<font*1.8&&Math.abs(p.y-y)<font*.75);tries++)y-=font*.8;
      occupied.push({x:pos.x,y});
      const punch=this.reducedMotion?1:1+Math.exp(-text.age*18)*.35*Math.sin(Math.min(1,text.age/.09)*Math.PI);
      const jitter=this.reducedMotion?0:Math.exp(-text.age*8)*Math.min(2.4,text.tier*.7+(text.crit?1:0));
      ctx.save();ctx.translate(pos.x+Math.sin(text.seed+text.age*78)*jitter,y+Math.cos(text.seed+text.age*64)*jitter);
      ctx.rotate(text.tilt*(1-progress*.3));ctx.scale(punch,punch);ctx.globalAlpha=Math.min(1,(1-progress)*4);
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${font}px "Courier New", "Microsoft YaHei", monospace`;
      if(text.flames&&!this.reducedMotion){
        for(let i=0;i<7;i++){
          const phase=(text.age*2.5+i*.17)%1,w=font*.13,h=font*(.2+.35*phase);
          ctx.fillStyle=i%2?'#ff703dcc':'#ffc04dba';ctx.fillRect((i-3)*font*.19,-font*.25-h,w,h);
        }
      }
      ctx.shadowColor=text.flames?'#ff792e':text.crit?'#f5cb5b':'#000000';ctx.shadowBlur=text.flames?9:text.crit?6:0;
      ctx.lineJoin='round';ctx.lineWidth=Math.max(3,font*.15);ctx.strokeStyle='#21130e';ctx.strokeText(text.value,0,0);
      const gradient=ctx.createLinearGradient(0,-font/2,0,font/2);gradient.addColorStop(0,'#fffce4');gradient.addColorStop(.45,text.color);gradient.addColorStop(1,text.flames?'#ff7d37':text.color);
      ctx.fillStyle=gradient;ctx.fillText(text.value,0,0);ctx.shadowBlur=0;
      if(text.label){ctx.font=`bold ${Math.max(8,font*.36)}px "Microsoft YaHei", monospace`;ctx.fillStyle=text.crit?'#ffe68b':'#f8d9a3';ctx.lineWidth=2;ctx.strokeText(text.label,0,-font*.85);ctx.fillText(text.label,0,-font*.85);}
      ctx.restore();
    }
    ctx.restore();
  }
}
