import * as THREE from '../vendor/three.module.js';

// Additional Java 1.21.5 skin rigs. Model units are skin pixels, feet stand on
// y=0 and faces look toward +Z. Textures remain caller-owned, including aliases.
const SKINS = {
  evoker:[64,64], vindicator:[64,64], vex:[32,32], witch:[64,128],
  zombified_piglin:[64,64], piglin_brute:[64,64], magma_cube:[64,64],
  ghast:[64,32], drowned:[64,64], husk:[64,64], end_crystal:[128,64],
};
const HEIGHTS = {evoker:66,vindicator:66,vex:34,witch:76,zombified_piglin:66,piglin_brute:68,magma_cube:32,ghast:80,drowned:64,trident_drowned:64,husk:66};
const resolve = (textures, key) => textures[key] || textures[key.replaceAll('_','-')] || null;

function material(map, color = 0xffffff, extra = {}) {
  if (map) { map.magFilter=map.minFilter=THREE.NearestFilter;map.generateMipmaps=false;map.colorSpace=THREE.SRGBColorSpace; }
  return new THREE.MeshLambertMaterial({map,color:map?0xffffff:color,alphaTest:.08,...extra});
}

function boxUV(w,h,d,u,v,atlas,inflate=0,mirror=false,skinSize=null) {
  const [sw,sh,sd]=skinSize || [w,h,d];
  const geometry=new THREE.BoxGeometry(Math.max(.025,w+inflate*2),Math.max(.025,h+inflate*2),Math.max(.025,d+inflate*2));
  const faces=[[u+sd+sw,v+sd,sd,sh],[u,v+sd,sd,sh],[u+sd,v,sw,sd],[u+sd+sw,v,sw,sd],[u+sd,v+sd,sw,sh],[u+sd*2+sw,v+sd,sw,sh]];
  if(mirror)[faces[0],faces[1]]=[faces[1],faces[0]];
  const uv=geometry.attributes.uv;
  for(let face=0;face<6;face++)for(let corner=0;corner<4;corner++){
    const index=face*4+corner,[x,y,fw,fh]=faces[face];
    let a=uv.getX(index),b=1-uv.getY(index);
    if(mirror)a=1-a;if(face===3)b=1-b;
    uv.setXY(index,(x+a*fw)/atlas[0],1-(y+b*fh)/atlas[1]);
  }
  return geometry;
}

function rig(kind,textures,skin=kind) {
  const root=new THREE.Group();root.name=`mob:${kind}`;
  const body=new THREE.Group();root.add(body);
  const skinMap=resolve(textures,skin),skinMaterial=material(skinMap,0xaaa398);
  const bones={},materials=new Set([skinMaterial]);
  function bone(name,x=0,y=0,z=0,parent=body){const b=new THREE.Group();b.name=name;b.position.set(x,y,z);parent.add(b);bones[name]=b;return b;}
  function cube(parent,w,h,d,x,y,z,u=0,v=0,options={}){
    const mat=options.material || skinMaterial;materials.add(mat);
    const mesh=new THREE.Mesh(boxUV(w,h,d,u,v,options.atlas||SKINS[skin],options.inflate||0,!!options.mirror,options.skinSize),mat);
    mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function solid(parent,w,h,d,x,y,z,color,extra={}){return cube(parent,w,h,d,x,y,z,0,0,{material:material(null,color,extra)});}
  function finish(naturalHeight,animate=()=>{}){
    body.scale.setScalar((HEIGHTS[kind]||naturalHeight)/naturalHeight);
    Object.assign(root.userData,{kind,head:bones.head||body,bones,materials:[...materials],height:HEIGHTS[kind]||naturalHeight});
    root.userData.animate=(t=0,moving=true)=>animate(Number.isFinite(t)?t:0,typeof moving==='number'?Math.max(0,Math.min(1,moving)):moving?1:0);
    root.userData.animate(0,0);return root;
  }
  return {root,body,skinMap,skinMaterial,bones,bone,cube,solid,finish};
}

function axe(m,parent,golden=false){
  const tool=m.bone('axe',0,-8,2,parent);tool.rotation.z=.15;
  m.solid(tool,1.2,16,1.2,0,0,0,0x705030);
  const color=golden?0xe7b73e:0xc0c5c5;
  m.solid(tool,1.7,5,2,0,6,0,color);
  m.solid(tool,4.5,5.5,1.5,-2.5,6,0,color);
  m.solid(tool,1.6,7,1.6,-4.6,5.7,0,color);
  return tool;
}

function illager(kind,textures){
  const m=rig(kind,textures),{bone,cube}=m;
  const head=bone('head',0,24,0);cube(head,8,10,8,0,5,0);cube(head,2,4,2,0,2,5,24,0);
  cube(m.body,8,12,6,0,18,0,16,20);cube(m.body,8,18,6,0,15,0,0,38);
  const legs=[],arms=[];
  for(const side of [-1,1]){
    const leg=bone(side<0?'rightLeg':'leftLeg',side*2,12,0);cube(leg,4,12,4,0,-6,0,0,22,{mirror:side>0});legs.push(leg);
    const arm=bone(side<0?'rightArm':'leftArm',side*6,22,0);cube(arm,4,12,4,0,-4,0,40,46,{mirror:side>0});arms.push(arm);
  }
  if(kind==='vindicator')axe(m,arms[0]);
  return m.finish(34,(t,moving)=>{
    const step=Math.sin(t*6)*.35*moving;legs[0].rotation.x=step;legs[1].rotation.x=-step;head.rotation.y=Math.sin(t*.7)*.1;
    if(kind==='evoker'){
      arms[0].rotation.z=-1.9+Math.sin(t*3)*.08;arms[1].rotation.z=1.9-Math.sin(t*3)*.08;
      arms.forEach(a=>a.rotation.x=-.2+Math.sin(t*2)*.08);
    }else{arms[0].rotation.x=-1.55+Math.sin(t*4)*.22;arms[1].rotation.x=-step*.6;}
  });
}

function witch(textures){
  const m=rig('witch',textures),{bone,cube}=m;
  const head=bone('head',0,24,0);cube(head,8,10,8,0,5,0);const nose=bone('nose',0,2,4,head);cube(nose,2,4,2,0,0,1,24,0);cube(nose,1,1,1,0,-.7,2,0,0);
  cube(m.body,8,12,6,0,18,0,16,20);cube(m.body,8,18,6,0,15,0,0,38);
  const arms=bone('arms',0,21,0);cube(arms,8,4,4,0,-6,4,40,38);
  for(const side of [-1,1])cube(arms,4,8,4,side*4,-3,1,44,22,{mirror:side>0});
  const legs=[];for(const side of [-1,1]){const leg=bone(`leg${side}`,side*2,12,0);cube(leg,4,12,4,0,-6,0,0,22);legs.push(leg);}
  cube(head,10,2,10,0,11,0,0,64);
  const hat=bone('hat',0,12,0,head);hat.rotation.z=-.075;hat.rotation.x=.05;cube(hat,7,4,7,0,2,0,0,76);
  const tip=bone('hatTip',0,4,0,hat);tip.rotation.z=-.15;cube(tip,4,4,4,0,2,0,0,87);
  const point=bone('hatPoint',0,4,0,tip);point.rotation.z=-.35;cube(point,1,2,1,0,1,0,0,95);
  return m.finish(46,(t,moving)=>{legs[0].rotation.x=Math.sin(t*5)*.3*moving;legs[1].rotation.x=-legs[0].rotation.x;head.rotation.y=Math.sin(t*.8)*.12;nose.rotation.x=Math.sin(t*2.5)*.05;arms.rotation.x=-.12;});
}

function vex(textures){
  const m=rig('vex',textures),{bone,cube}=m;
  const head=bone('head',0,5,0);cube(head,5,5,5,0,2.5,0,0,0);
  cube(m.body,3,4,2,0,3,0,0,10);
  const arms=[];for(const side of [-1,1]){const arm=bone(side<0?'rightArm':'leftArm',side*2.5,4,0);cube(arm,2,4,2,0,-1.5,0,23,0,{mirror:side>0});arms.push(arm);}
  const wings=[];for(const side of [-1,1]){
    const wing=bone(`wing${side}`,side*1.2,4,-1.1);cube(wing,0,5,8,0,-1,-4,16,14,{mirror:side>0});wings.push(wing);
  }
  const blade=m.bone('sword',0,-3,1,arms[0]);m.solid(blade,.8,9,.8,0,2,0,0xb5d0da);m.solid(blade,3,.65,.8,0,-1,0,0x6b7785);m.solid(blade,.8,3,.8,0,-2,0,0x675644);
  return m.finish(10,(t,moving)=>{
    m.body.position.y=4+Math.sin(t*3)*1.8;head.rotation.y=Math.sin(t)*.12;
    wings[0].rotation.y=-.45-Math.sin(t*17)*.45;wings[1].rotation.y=.45+Math.sin(t*17)*.45;
    arms[0].rotation.x=-1.4+Math.sin(t*5)*.12;arms[1].rotation.z=.2;arms[1].rotation.x=Math.sin(t*5)*.15*moving;
  });
}

function piglin(kind,textures){
  const m=rig(kind,textures),{bone,cube}=m;
  cube(m.body,8,12,4,0,18,0,16,16);
  const head=bone('head',0,24,0);cube(head,10,8,8,0,4,0,0,0);cube(head,4,4,1,0,2,4.5,31,1);
  const ears=[];for(const side of [-1,1]){const ear=bone(`ear${side}`,side*5,6,0,head);cube(ear,1,5,4,side*.5,-1.5,0,side<0?2:51,side<0?4:6);ears.push(ear);}
  const legs=[],arms=[];
  for(const side of [-1,1]){
    const left=side>0,leg=bone(left?'leftLeg':'rightLeg',side*2,12,0);cube(leg,4,12,4,0,-6,0,left?16:0,left?48:16);legs.push(leg);
    const arm=bone(left?'leftArm':'rightArm',side*6,22,0);cube(arm,4,12,4,0,-4,0,left?32:40,left?48:16);arms.push(arm);
  }
  if(kind==='piglin_brute')axe(m,arms[0],true);
  else{const sword=bone('sword',0,-8,1.5,arms[0]);m.solid(sword,1.4,15,.8,0,3,0,0xe5bb48);m.solid(sword,5,1,1,0,-3,0,0xd3a834);m.solid(sword,1.2,4,1.2,0,-5,0,0x6e472d);}
  return m.finish(32,(t,moving)=>{const step=Math.sin(t*6)*.38*moving;legs[0].rotation.x=step;legs[1].rotation.x=-step;arms[0].rotation.x=-1.15+Math.sin(t*4)*.18;arms[1].rotation.x=kind==='zombified_piglin'?-1.1:-step*.5;ears[0].rotation.z=-.35+Math.sin(t*2)*.08;ears[1].rotation.z=.35-Math.sin(t*2)*.08;head.rotation.y=Math.sin(t*.8)*.08;});
}

function addTrident(m,parent,textures){
  const trident=m.bone('trident',0,-7,2,parent);trident.rotation.x=-.12;
  const mat=material(resolve(textures,'trident'),0x6aa8a5);
  const part=(w,h,d,x,y,z,u,v)=>m.cube(trident,w,h,d,x,y,z,u,v,{material:mat,atlas:[32,32]});
  part(1,25,1,0,0,0,0,6);part(5,2,1,0,13,0,4,0);
  part(1,4,1,-2,16,0,4,3);part(1,5,1,0,16.5,0,0,0);part(1,4,1,2,16,0,4,3);
}

function drowned(kind,textures){
  const skin=kind==='husk'?'husk':'drowned',m=rig(kind,textures,skin),{bone,cube}=m;
  const outer=skin==='drowned'?material(resolve(textures,'drowned_outer'),0x89a39b,{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}):null;
  function dressed(parent,w,h,d,x,y,z,u,v){cube(parent,w,h,d,x,y,z,u,v);if(outer)cube(parent,w,h,d,x,y,z,u,v,{material:outer,inflate:.22});}
  dressed(m.body,8,12,4,0,18,0,16,16);
  const head=bone('head',0,24,0);dressed(head,8,8,8,0,4,0,0,0);
  const arms=[],legs=[];
  for(const side of [-1,1]){
    const left=side>0,leg=bone(left?'leftLeg':'rightLeg',side*2,12,0);dressed(leg,4,12,4,0,-6,0,left?16:0,left?48:16);legs.push(leg);
    const arm=bone(left?'leftArm':'rightArm',side*6,22,0);dressed(arm,4,12,4,0,-4,0,left?32:40,left?48:16);arms.push(arm);
  }
  if(kind==='trident_drowned')addTrident(m,arms[0],textures);
  return m.finish(32,(t,moving)=>{const step=Math.sin(t*5)*.4*moving;legs[0].rotation.x=step;legs[1].rotation.x=-step;arms[0].rotation.x=(kind==='trident_drowned'?-.6:-1.15)-step*.35;arms[1].rotation.x=-1.1+step*.35;head.rotation.y=Math.sin(t*.7)*.09;});
}

function magmaCube(textures){
  const m=rig('magma_cube',textures),layers=[];
  m.skinMaterial.emissive.setHex(0x551608);m.skinMaterial.emissiveIntensity=.18;
  m.cube(m.body,4,4,4,0,4,0,0,16);
  for(let i=0;i<8;i++){const layer=m.bone(`slice${i}`,0,i+.5,0);m.cube(layer,8,1,8,0,0,0,0,i);layers.push(layer);}
  return m.finish(8,(t,moving)=>{const hop=Math.max(0,Math.sin(t*4))*moving;layers.forEach((layer,i)=>layer.position.y=i+.5+hop*i*.3);m.body.position.y=hop*5;});
}

function ghast(textures){
  const m=rig('ghast',textures),tentacles=[];
  const head=m.bone('head',0,26,0);m.cube(head,16,16,16,0,0,0,0,0);
  const lengths=[8,13,9,11,15,10,12,8,14];
  for(let i=0;i<9;i++){const limb=m.bone(`tentacle${i}`,(i%3-1)*5,18,(Math.floor(i/3)-1)*5);m.cube(limb,2,lengths[i],2,0,-lengths[i]/2,0,0,0);tentacles.push(limb);}
  return m.finish(34,(t)=>{m.body.position.y=7+Math.sin(t*.9)*3;tentacles.forEach((limb,i)=>{limb.rotation.x=.15+Math.sin(t*1.7+i)*.18;limb.rotation.z=Math.cos(t*1.1+i)*.08;});});
}

export function createRealmMobModel(kind,textures={}){
  if(kind==='evoker'||kind==='vindicator')return illager(kind,textures);
  if(kind==='vex')return vex(textures);
  if(kind==='witch')return witch(textures);
  if(kind==='zombified_piglin'||kind==='piglin_brute')return piglin(kind,textures);
  if(kind==='magma_cube')return magmaCube(textures);
  if(kind==='ghast')return ghast(textures);
  if(kind==='drowned'||kind==='trident_drowned'||kind==='husk')return drowned(kind,textures);
  return null;
}

/** Standalone end-crystal rig; caller places it in the world and calls
 * userData.animate(t). The optional cage is opaque obsidian geometry. */
export function createEndCrystalModel(textures={}, {shielded=false}={}){
  const m=rig('end_crystal',textures),{bone,cube}=m;
  const crystal=bone('crystal',0,16,0);
  const glass=material(resolve(textures,'end_crystal'),0xbbe8f4,{transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide});
  const shell=cube(crystal,8,8,8,0,0,0,0,0,{material:glass,skinSize:[16,16,16]});shell.rotation.set(.6,.5,.6);shell.castShadow=false;
  const inner=cube(crystal,6,6,6,0,0,0,0,0,{material:glass,skinSize:[16,16,16]});inner.rotation.set(-.6,.8,-.4);inner.castShadow=false;
  const core=material(resolve(textures,'end_crystal'),0xfca3ed,{emissive:0xf53ec7,emissiveIntensity:.8});
  const gem=cube(crystal,4,4,4,0,0,0,64,0,{material:core,skinSize:[16,16,16]});gem.rotation.z=.7;
  cube(m.body,12,4,12,0,2,0,0,32,{skinSize:[24,8,24]});
  const cage=bone('cage');cage.visible=!!shielded;
  const obsidian=material(resolve(textures,'obsidian'),0x22182e);
  for(const x of [-7,7])for(const z of [-7,7])cube(cage,1.6,26,1.6,x,13,z,0,0,{material:obsidian,atlas:[16,16],skinSize:[4,4,4]});
  for(const y of [7,24]){cube(cage,16,1.4,1.4,0,y,-7,0,0,{material:obsidian,atlas:[16,16],skinSize:[4,4,4]});cube(cage,16,1.4,1.4,0,y,7,0,0,{material:obsidian,atlas:[16,16],skinSize:[4,4,4]});cube(cage,1.4,1.4,16,-7,y,0,0,0,{material:obsidian,atlas:[16,16],skinSize:[4,4,4]});cube(cage,1.4,1.4,16,7,y,0,0,0,{material:obsidian,atlas:[16,16],skinSize:[4,4,4]});}
  const result=m.finish(28,(t)=>{crystal.position.y=15+Math.sin(t*1.4)*1.2;crystal.rotation.y=t*.55;shell.rotation.y=.5+t*.3;inner.rotation.y=.8-t*.4;});
  result.userData.shield=cage;result.userData.setShielded=value=>{cage.visible=!!value;};return result;
}
