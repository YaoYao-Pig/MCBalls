import * as THREE from '../vendor/three.module.js';

const LIMIT = 192;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const palette = { fireSpread:'#ff983f', frostBurst:'#a8eeff', quake:'#e3bd76', gravityMark:'#cb9eff', gravityCollapse:'#c391ff' };

/** Batched world-space effects. These meshes are visual only and never become
 * raycast targets or add hits to the simulation. */
export class BuildEffects {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'build-combat-effects';
    this.effects = []; this.arcs=[]; this.dummy = new THREE.Object3D(); this.direction = new THREE.Vector3();
    this.up = new THREE.Vector3(0,1,0); this.color = new THREE.Color(); this.white = new THREE.Color('#ffffff');
    const material = options => new THREE.MeshBasicMaterial({depthWrite:false,transparent:true,...options});
    const batch = (geometry, mat, capacity) => {
      const mesh = new THREE.InstancedMesh(geometry,mat,capacity);
      mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);return mesh;
    };
    this.beams = batch(new THREE.CylinderGeometry(1,1,1,6),material({color:'#ffffff',blending:THREE.AdditiveBlending}),LIMIT);
    this.halos = batch(new THREE.CylinderGeometry(1,1,1,8),material({color:'#ffffff',opacity:.12,blending:THREE.AdditiveBlending}),LIMIT);
    this.joints = batch(new THREE.OctahedronGeometry(1,0),material({color:'#ffffff',blending:THREE.AdditiveBlending}),LIMIT);
    this.rings = batch(new THREE.RingGeometry(.93,1,32),material({color:'#ffffff',side:THREE.DoubleSide,opacity:.7,blending:THREE.AdditiveBlending}),128);
    this.shards = batch(new THREE.OctahedronGeometry(1,0),material({color:'#ffffff',opacity:.85}),256);
    this.flames = batch(new THREE.BoxGeometry(1,1,1),material({color:'#ffffff',opacity:.85,blending:THREE.AdditiveBlending}),360);
    this.ice = batch(new THREE.BoxGeometry(1,1,1),material({color:'#b6edff',wireframe:true,opacity:.65}),120);
    this.marks = batch(new THREE.RingGeometry(.88,1,24),material({color:'#ce9dff',side:THREE.DoubleSide,opacity:.7}),120);
    this.anchors = batch(new THREE.RingGeometry(.8,1,4),material({color:'#e6d3ff',side:THREE.DoubleSide,opacity:.8}),18);
    this.charge = batch(new THREE.TorusGeometry(1,.06,4,40),material({color:'#e4c2ff',blending:THREE.AdditiveBlending}),1);
    this.crackPositions = new Float32Array(128*24*3); this.crackColors = new Float32Array(128*24*3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(this.crackPositions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color',new THREE.BufferAttribute(this.crackColors,3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
    this.cracks = new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.85,depthWrite:false}));
    this.cracks.frustumCulled=false;this.group.add(this.cracks);
  }

  emit(event) {
    if(event?.type==='lightning'&&point(event.from)&&point(event.to)){
      const a=event.from,b=event.to,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
      const mid={x:(a.x+b.x)/2-dy/len*8,y:(a.y+b.y)/2+dx/len*8};
      if(this.arcs.length>=64)this.arcs.shift();
      this.arcs.push({segments:[{from:{...a},to:mid},{from:mid,to:{...b}}],life:.2,maxLife:.2,width:2.8,color:'#67e8f9'});return;
    }
    if(event?.type!=='buildEffect'||!palette[event.effect]||!point(event))return;
    if(this.effects.length>=128)this.effects.shift();
    this.effects.push({effect:event.effect,x:event.x,y:event.y,radius:clamp(event.radius||60,8,240),color:event.color||palette[event.effect],life:event.effect==='fireSpread'?.35:.6,maxLife:event.effect==='fireSpread'?.35:.6});
  }

  put(mesh,index,x,y,h,sx,sy,sz,color,rotation=null) {
    const d=this.dummy;d.position.set(x-500,h,y-360);d.scale.set(sx,sy,sz);
    if(rotation)d.rotation.set(...rotation);else d.rotation.set(0,0,0);
    d.updateMatrix();mesh.setMatrixAt(index,d.matrix);
    if(color){this.color.set(color);mesh.setColorAt(index,this.color);}
  }

  update(state,time,dt,aim=null) {
    const active=state.phase==='playing'||state.phase==='paused';
    if(!active&&state.phase!=='upgrade'){this.reset();return;}
    let count=0;
    this.arcs=this.arcs.filter(arc=>(arc.life-=Math.max(0,dt))>0);
    for(const beam of [...(state.beams||[]),...this.arcs]) {
      const fade=clamp((beam.life||0)/(beam.maxLife||.35),0,1);
      if(fade<=0)continue;
      for(const segment of beam.segments||[]) {
        if(count>=LIMIT)break;
        const a=segment.from,b=segment.to;if(!point(a)||!point(b))continue;
        const length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.01)continue;
        const width=clamp(beam.width||6,2,20),height=22;
        this.direction.set(b.x-a.x,0,b.y-a.y).normalize();this.dummy.quaternion.setFromUnitVectors(this.up,this.direction);
        this.dummy.position.set((a.x+b.x)/2-500,height,(a.y+b.y)/2-360);
        this.dummy.scale.set(width*.45,length,width*.45);this.dummy.updateMatrix();this.beams.setMatrixAt(count,this.dummy.matrix);
        this.color.set(beam.color||'#d39cff').lerp(this.white,.2).multiplyScalar(.6+fade*.65);this.beams.setColorAt(count,this.color);
        this.dummy.scale.set(width*1.7,length,width*1.7);this.dummy.updateMatrix();this.halos.setMatrixAt(count,this.dummy.matrix);
        this.color.set(beam.color||'#d39cff').multiplyScalar(fade*.85);this.halos.setColorAt(count,this.color);
        this.put(this.joints,count,b.x,b.y,height,width*.95,width*.95,width*.95,beam.color||'#d39cff',[0,time,Math.PI/4]);count++;
      }
    }
    this.beams.count=this.halos.count=this.joints.count=count;
    let rings=0,shards=0,vertices=0;
    for(const e of this.effects) {
      e.life-=Math.max(0,dt);if(e.life<=0)continue;
      const progress=1-e.life/e.maxLife,collapse=e.effect==='gravityCollapse',radius=e.radius*(collapse?1-progress*.88:.12+progress*.88);
      if(rings<128)this.put(this.rings,rings++,e.x,e.y,3,radius,radius,1,e.color,[-Math.PI/2,0,0]);
      const n=e.effect==='quake'?12:e.effect==='fireSpread'?4:10;
      for(let i=0;i<n&&shards<256;i++) {
        const angle=i/n*Math.PI*2+e.x*.01,spread=radius*(.65+(i%3)*.15);
        const size=(e.effect==='frostBurst'?6:3)*(1-progress);
        this.put(this.shards,shards++,e.x+Math.cos(angle)*spread,e.y+Math.sin(angle)*spread,6+Math.sin(progress*Math.PI)*30,size,size*1.8,size,e.color,[angle,time+i,angle]);
        if(e.effect==='quake'&&vertices+2<=this.crackPositions.length/3) {
          this.color.set(e.color).multiplyScalar(1-progress*.7);
          for(const fraction of [.2,1]) {
            const j=vertices++*3;this.crackPositions[j]=e.x-500+Math.cos(angle)*spread*fraction;this.crackPositions[j+1]=2;this.crackPositions[j+2]=e.y-360+Math.sin(angle)*spread*fraction;
            this.crackColors[j]=this.color.r;this.crackColors[j+1]=this.color.g;this.crackColors[j+2]=this.color.b;
          }
        }
      }
    }
    this.effects=this.effects.filter(e=>e.life>0);this.rings.count=rings;this.shards.count=shards;
    this.cracks.geometry.setDrawRange(0,vertices);this.cracks.geometry.attributes.position.needsUpdate=true;this.cracks.geometry.attributes.color.needsUpdate=true;
    let flames=0,ice=0,marks=0;
    for(const enemy of state.enemies||[]) {
      if(enemy.hp<=0)continue;
      if(enemy.burnTimer>0)for(let i=0;i<3&&flames<360;i++) {
        const phase=(time*1.8+i*.33+enemy.id*.13)%1,angle=i*Math.PI*2/3+enemy.id;
        this.put(this.flames,flames++,enemy.x+Math.cos(angle)*enemy.r*.8,enemy.y+Math.sin(angle)*enemy.r*.8,7+phase*46,5,12*(1-phase)+3,5,i===1?'#ffe280':'#ff7b29',[0,angle,.15*Math.sin(time*12+i)]);
      }
      if(enemy.frostTimer>0&&enemy.frostStacks>0&&ice<120) {
        const width=enemy.r*2.2,height=enemy.frostStacks>1?48:20;
        this.put(this.ice,ice++,enemy.x,enemy.y,height/2,width,height,width,enemy.frostStacks>1?'#c4f8ff':'#73bddd');
      }
      if(enemy.gravityTimer>0&&marks<120) {
        const radius=enemy.r+8+Math.sin(time*4)*3;this.put(this.marks,marks++,enemy.x,enemy.y,4,radius,radius,1,'#ce9dff',[-Math.PI/2,0,time*.5]);
      }
    }
    this.flames.count=flames;this.ice.count=ice;this.marks.count=marks;
    let anchors=0;
    for(const ball of state.balls||[])if(ball.type!=='ghost'&&!ball.detonated&&(ball.turretActive||ball.enchantments?.stationary_turret>0)&&anchors<18) {
      const radius=ball.r+11;this.put(this.anchors,anchors++,ball.x,ball.y,2,radius,radius,1,'#e3c5ff',[-Math.PI/2,0,Math.PI/4]);
    }
    this.anchors.count=anchors;this.charge.count=0;
    if(aim?.down&&aim.mode==='beam') {
      const ball=state.balls.find(b=>b.id===aim.ballId);
      if(ball){const radius=ball.r+12+(1-(aim.charge||0))*12;this.put(this.charge,0,ball.x,ball.y,ball.r+4,radius,radius,1,aim.charge>=1?'#e9ffb1':'#c5a3ff',[-Math.PI/2,0,time]);this.charge.count=1;}
    }
    for(const mesh of [this.beams,this.halos,this.joints,this.rings,this.shards,this.flames,this.ice,this.marks,this.anchors,this.charge]) {
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  }

  reset() { this.effects.length=0;this.arcs.length=0;for(const object of this.group.children)if(object.isInstancedMesh)object.count=0;this.cracks.geometry.setDrawRange(0,0); }
  dispose() { this.reset();for(const object of this.group.children){object.geometry?.dispose();object.material?.dispose();}this.group.removeFromParent(); }
}
