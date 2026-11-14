import * as THREE from '../vendor/three.module.js';
import { createMobModel, createEndCrystalModel } from './minecraft-models.js';
import { ShaderPipeline } from './shader-pipeline.js';
import { createShaderWorld } from './shader-world.js';
import { computeArenaFrustum } from './camera-framing.js';
import { createWorkbenchScene } from './workbench-scene.js';
import { createCraftingScene } from './crafting-scene.js';
import { RealmEffects } from './realm-effects.js';
import { describeRicochet, describeCatch } from './core.js';
import { BuildEffects } from './build-effects.js';

const textureFiles = ['grass-top','grass-side','dirt','stone','iron','ice','gold','diamond','obsidian','redstone','wood-planks','beacon','glass','stick','bone','blaze-rod','end-rod','ender-pearl','zombie','skeleton','creeper','enderman','slime','blaze','wither','dragon','warden','iron-golem','snow-golem','villager','villager-plains','librarian','toolsmith','weaponsmith','oak-log','oak-log-top','oak-leaves','iron-ore','diamond-ore','tnt-side','tnt-top'];
textureFiles.push('evoker','vex','vex-charging','vindicator','witch','zombified-piglin','piglin-brute','magma-cube','ghast','ghast-shooting','drowned','drowned-outer','husk','trident','iron-axe','golden-axe','netherrack','soul-sand','basalt-side','blackstone','end-stone','end-portal-frame-top','end-portal-frame-side','end-portal-frame-eye','nether-portal','lava-still','end-crystal','lightning-rod','nether-gold-ore','nether-quartz-ore','ancient-debris-side');
textureFiles.push('slime-block');
const blockKeys = { cue:'grass-side',iron:'iron',storm:'redstone',frost:'ice',gold:'gold',slime:'slime-block',ghost:'diamond' };
const enemyAliases = { grunt:'zombie',runner:'creeper',tank:'skeleton',boss:'wither' };
const groundPosition = (x,y,h=0) => new THREE.Vector3(x-500,h,y-360);

export class WorldRenderer {
  constructor(canvas) {
    this.canvas=canvas; this.width=1000; this.height=720; this.azimuth=.16; this.hoverId=null; this.meshes=new Map(); this.materials=new Map();this.quality='high';this.shadowLights=[];
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75)); this.renderer.shadowMap.enabled=true; this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace; this.renderer.setClearColor('#17291c');
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;
    this.textures={};this.tiledMaps=new Map(); const loader=new THREE.TextureLoader();
    for(const name of textureFiles){
      const texture=loader.load(new URL(`../assets/minecraft/${name}.png`,import.meta.url).href,loaded=>{
        if(name==='grass-top'&&this.floorGrassMap){this.floorGrassMap.image=loaded.image;this.floorGrassMap.needsUpdate=true;}
        if(this.tiledMaps.has(name)){const map=this.tiledMaps.get(name);map.image=loaded.image;map.needsUpdate=true;}
      });
      texture.magFilter=THREE.NearestFilter; texture.minFilter=THREE.NearestFilter; texture.colorSpace=THREE.SRGBColorSpace; texture.generateMipmaps=false;
      this.textures[name]=texture; this.textures[name.replaceAll('-','_')]=texture;
    }
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color('#1b3021');
    this.atmosphere=createShaderWorld(this.scene,this.renderer,this.textures);
    this.camera=new THREE.OrthographicCamera(-560,560,410,-410,1,3000);
    this.raycaster=new THREE.Raycaster(); this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    this.addLights(this.scene); this.buildGround(); this.buildBase(); this.buildCue();
    this.aimLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#fff2a6',dashSize:9,gapSize:7,depthTest:false})); this.aimLine.renderOrder=20; this.aimLine.visible=false; this.scene.add(this.aimLine);
    this.selection=new THREE.Mesh(new THREE.RingGeometry(20,22,32),new THREE.MeshBasicMaterial({color:'#fff0a0',side:THREE.DoubleSide,depthTest:false})); this.selection.rotation.x=-Math.PI/2; this.selection.visible=false; this.scene.add(this.selection);
    this.buildShop(); this.preview=this.previewState(); this.setCamera();
    this.pipeline=new ShaderPipeline(this.renderer,this.scene,this.camera);
    this.realmEffects=new RealmEffects(this.scene,this.textures);this.environmentKey='';this.lastRenderTime=0;this.craftingScene=null;this.selectedRecipe=null;
    this.workbenches={};
    this.buildEffects=new BuildEffects();this.scene.add(this.buildEffects.group);
    this.upgradeTargets=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:'#caff9f',wireframe:true,transparent:true,opacity:.9,depthTest:false,depthWrite:false}),18);this.upgradeTargets.count=0;this.upgradeTargets.frustumCulled=false;this.upgradeTargets.renderOrder=21;this.scene.add(this.upgradeTargets);this.targetDummy=new THREE.Object3D();this.targetColor=new THREE.Color();
    this.xpOrbs=new THREE.InstancedMesh(new THREE.OctahedronGeometry(5,0),new THREE.MeshBasicMaterial({color:new THREE.Color('#a9ff53').multiplyScalar(1.8)}),160);this.xpOrbs.count=0;this.xpOrbs.frustumCulled=false;this.scene.add(this.xpOrbs);this.xpDummy=new THREE.Object3D();
  }
  addLights(scene,track=true){
    const skyLight=new THREE.HemisphereLight('#b6d5ff','#4c5632',.95);scene.add(skyLight);
    const sun=new THREE.DirectionalLight('#ffd49a',3.1); sun.position.set(-600,720,460); sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-650; sun.shadow.camera.right=650; sun.shadow.camera.top=630; sun.shadow.camera.bottom=-630; sun.shadow.camera.far=1800; sun.shadow.normalBias=.65; sun.shadow.bias=-.00012;sun.shadow.radius=2;scene.add(sun);if(track)this.shadowLights.push(sun);
    if(scene===this.scene){this.skyLight=skyLight;this.sunLight=sun;}
  }
  mat(name,color=0xffffff,transparent=false){
    const key=`${name}:${color}:${transparent}`;
    if(!this.materials.has(key)){
      if(name==='slime-block'){const material=new THREE.MeshStandardMaterial({map:this.textures[name]||null,color,transparent:true,opacity:1,depthWrite:false,roughness:.32,metalness:0});this.materials.set(key,material);return material;}
      const metal=['iron','gold'].includes(name),gem=['diamond','ice'].includes(name),red=name==='redstone';
      this.materials.set(key,new THREE.MeshStandardMaterial({map:this.textures[name]||null,color,metalness:metal?.48:gem?.12:0,roughness:metal?.34:gem?.23:.92,emissive:red?0x7f1005:0x000000,emissiveIntensity:red?.16:1,transparent:false,alphaTest:transparent?.4:0,side:THREE.FrontSide}));
    }
    return this.materials.get(key);
  }
  cube(w,h,d,material,x=0,y=0,z=0){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;}
  blockMaterial(type,traits=[],fusionLevel=0){
    if(type==='tnt')return [this.mat('tnt-side'),this.mat('tnt-side'),this.mat('tnt-top'),this.mat('tnt-top'),this.mat('tnt-side'),this.mat('tnt-side')];
    if(fusionLevel>0&&traits.length){const keys=[...(type==='cue'?['grass-side']:[]),...traits.map(t=>blockKeys[t]).filter(Boolean)];const faces=Array.from({length:6},(_,i)=>this.mat(keys[i%keys.length]));if(type==='cue')faces[2]=this.mat('grass-top',0x81b649);return faces;}
    if(type==='cue')return [this.mat('grass-side'),this.mat('grass-side'),this.mat('grass-top',0x81b649),this.mat('dirt'),this.mat('grass-side'),this.mat('grass-side')];
    return this.mat(blockKeys[type]||type);
  }
  buildGround(){
    // Texture.clone() itself marks an empty image ready for upload. Build this
    // repeating instance without an upload until TextureLoader has the pixels.
    const source=this.textures['grass-top'],map=new THREE.Texture(source.image);this.floorGrassMap=map;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(25,18);map.magFilter=THREE.NearestFilter;map.minFilter=THREE.NearestFilter;map.generateMipmaps=false;map.colorSpace=THREE.SRGBColorSpace;
    if(map.image)map.needsUpdate=true;
    const top=new THREE.MeshStandardMaterial({map,color:'#7c9e4c',roughness:.96,bumpMap:map,bumpScale:.55});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,720),top);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;this.scene.add(floor);this.floorMesh=floor;this.grassMaterial=top;
    this.islandMesh=this.cube(1000,45,720,this.mat('dirt'),0,-24,0);this.scene.add(this.islandMesh);
    const stone=this.mat('stone',0x9b9b8c);
    for(const z of [-345,345])this.scene.add(this.cube(970,11,14,stone,0,5,z));
    for(const x of [-485,485])this.scene.add(this.cube(14,11,690,stone,x,5,0));
    for(const [x,z] of [[-480,-340],[480,-340],[-480,340],[480,340]]){
      this.scene.add(this.cube(29,28,29,this.mat('wood-planks'),x,14,z));
      const lantern=this.cube(10,12,10,new THREE.MeshStandardMaterial({color:'#ffc655',emissive:'#ffad37',emissiveIntensity:2.2}),x,34,z);lantern.castShadow=false;this.scene.add(lantern);
      const light=new THREE.PointLight('#ffbd68',3600,170,2);light.position.set(x,44,z);this.scene.add(light);
    }
  }
  buildBase(){
    this.base=new THREE.Group();this.scene.add(this.base);
    this.base.add(this.cube(86,13,86,this.mat('obsidian'),0,7,0));
    this.base.add(this.cube(61,15,61,this.mat('iron'),0,21,0));
    this.base.add(this.cube(33,31,33,this.mat('beacon'),0,43,0));
    const glass=new THREE.MeshPhongMaterial({color:'#a4f9ef',transparent:true,opacity:.22,shininess:80});
    const cover=this.cube(38,37,38,glass,0,43,0);cover.castShadow=false;this.base.add(cover);
    const core=this.cube(12,16,12,new THREE.MeshStandardMaterial({color:'#c9ffed',emissive:'#79ffda',emissiveIntensity:3.4,roughness:.2}),0,46,0);core.castShadow=false;this.base.add(core);
    const glow=new THREE.PointLight('#72efdc',4800,160,2);glow.position.y=56;this.base.add(glow);
    this.baseHitMeshes=this.base.children.filter(object=>object.isMesh);
    this.baseOutline=new THREE.Group();this.baseOutline.visible=false;
    const outlineMaterial=new THREE.LineBasicMaterial({color:new THREE.Color('#aefff4').multiplyScalar(1.8),transparent:true,opacity:.95,depthTest:false,depthWrite:false});
    for(const mesh of this.baseHitMeshes){const outline=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),outlineMaterial);outline.position.copy(mesh.position);outline.scale.setScalar(1.045);outline.renderOrder=25;this.baseOutline.add(outline);}
    this.base.add(this.baseOutline);this.baseLevelMark=-1;
    this.baseTierMarkers=[];
    for(const [x,z] of [[-33,-33],[33,-33],[-33,33],[33,33]]){const marker=this.cube(7,7,7,this.mat('gold'),x,18,z);marker.visible=false;this.base.add(marker);this.baseTierMarkers.push(marker);}
    this.beam=new THREE.Mesh(new THREE.CylinderGeometry(8,8,210,4),new THREE.MeshBasicMaterial({color:new THREE.Color('#a4ffe1').multiplyScalar(2),transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending}));this.beam.position.y=158;this.base.add(this.beam);
    this.shield=new THREE.Mesh(new THREE.SphereGeometry(65,20,12),new THREE.MeshBasicMaterial({color:'#8adce7',wireframe:true,transparent:true,opacity:.18,depthWrite:false}));this.shield.position.y=15;this.shield.scale.y=.85;this.base.add(this.shield);
  }
  buildCue(){
    this.cue=new THREE.Group(); this.cue.visible=false;this.scene.add(this.cue);
    this.rodBody=this.cube(5,5,150,new THREE.MeshLambertMaterial({color:'#a1743b'}),0,0,75);this.cue.add(this.rodBody);
    this.rodTip=this.cube(7,7,10,new THREE.MeshLambertMaterial({color:'#ded7bc'}),0,0,0);this.cue.add(this.rodTip);
    this.rodEnd=this.cube(9,9,9,new THREE.MeshLambertMaterial({color:'#766545'}),0,0,150);this.cue.add(this.rodEnd);
  }
  buildShop(){
    this.shopScene=new THREE.Scene();this.shopScene.background=new THREE.Color('#192111');this.shopScene.environment=this.atmosphere.environment;this.shopScene.environmentIntensity=.35;this.addLights(this.shopScene);
    const shopSun=this.shadowLights.at(-1);shopSun.shadow.camera.left=-200;shopSun.shadow.camera.right=200;shopSun.shadow.camera.top=200;shopSun.shadow.camera.bottom=-200;shopSun.intensity=1.5;
    const keyLight=new THREE.PointLight('#ffd79f',18000,300,2);keyLight.position.set(-60,95,80);this.shopScene.add(keyLight);
    const fillLight=new THREE.PointLight('#abc9d9',4500,220,2);fillLight.position.set(80,55,70);this.shopScene.add(fillLight);
    this.shopCamera=new THREE.PerspectiveCamera(42,1,.5,1200);this.shopCamera.position.set(0,79,176);this.shopCamera.lookAt(0,15,0);
    const floor=this.cube(350,7,230,this.mat('wood-planks'),0,-5,0);this.shopScene.add(floor);
    this.shopScene.add(this.cube(350,150,8,this.mat('wood-planks',0x6d7055),0,70,-70));
    for(const x of [-117,117]){this.shopScene.add(this.cube(12,145,12,this.mat('oak-log'),x,70,-48));this.shopScene.add(this.cube(22,36,6,this.mat('diamond'),x,70,-41));}
    this.shopScene.add(this.cube(170,27,45,this.mat('wood-planks'),0,14,30));
    this.shopScene.add(this.cube(180,7,52,this.mat('wood-planks',0xc5ab7e),0,31,30));
    this.merchants={};
    for(const kind of ['toolsmith','librarian']){const m=createMobModel(kind,this.textures);m.position.set(0,0,-6);m.visible=false;this.shopScene.add(m);this.merchants[kind]=m;}
    this.shopItems=[];
    for(const [i,name] of ['iron','redstone','diamond','tnt-side'].entries()){
      const m=this.cube(13,13,13,this.mat(name),-59+i*39,42,32);m.rotation.y=.35;this.shopScene.add(m);this.shopItems.push(m);
    }
  }
  makeRicochetAura(ball){
    const aura=new THREE.Group();
    const rim=new THREE.Mesh(new THREE.RingGeometry(ball.r+4,ball.r+6,8),new THREE.MeshBasicMaterial({color:'#ffe49e',side:THREE.DoubleSide,transparent:true,opacity:.7,depthWrite:false}));
    rim.rotation.x=-Math.PI/2;rim.position.y=2;aura.add(rim);aura.userData.rim=rim;
    const colors={iron:'#f4d799',storm:'#ef6464',frost:'#94e8ff',gold:'#ffce4b',slime:'#b6ff79'};
    aura.userData.traits={};
    for(const [trait,color] of Object.entries(colors)){
      const dot=new THREE.Mesh(new THREE.BoxGeometry(5,5,5),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(1.5)}));
      dot.visible=false;aura.add(dot);aura.userData.traits[trait]=dot;
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,0],3));
    const trail=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#ffe49e',transparent:true,opacity:.55,depthWrite:false}));trail.frustumCulled=false;aura.add(trail);aura.userData.trail=trail;
    return aura;
  }
  previewState(){return{phase:'ready',hp:120,maxHp:120,shield:0,upgrades:{},balls:[{id:'preview-ball',type:'cue',x:620,y:465,r:15,vx:0,vy:0}],enemies:[
    {id:'p1',kind:'zombie',x:210,y:160,r:18,hp:100,maxHp:100},{id:'p2',kind:'creeper',x:770,y:170,r:17,hp:100,maxHp:100},{id:'p3',kind:'skeleton',x:835,y:455,r:17,hp:100,maxHp:100},{id:'p4',kind:'enderman',x:190,y:510,r:17,hp:100,maxHp:100},{id:'p5',kind:'slime',size:2,x:775,y:610,r:22,hp:100,maxHp:100}],resources:[{id:'pt1',kind:'tree',x:120,y:290,r:23},{id:'pt2',kind:'ore',x:870,y:320,r:22}],allies:[],projectiles:[]};}
  resize(w,h){this.width=w;this.height=h;this.renderer.setSize(w,h,false);this.setCamera();this.shopCamera.aspect=w/h;this.shopCamera.updateProjectionMatrix();this.pipeline?.resize(w,h,this.renderer.getPixelRatio());for(const bench of Object.values(this.workbenches||{}))bench.resize(w,h);this.craftingScene?.resize(w,h);}
  setCraftRecipe(recipe){this.selectedRecipe=recipe;this.craftingScene?.setRecipe(recipe);}
  pickBase(x,y,balls=[]){
    this.raycaster.setFromCamera(new THREE.Vector2(x/this.width*2-1,1-y/this.height*2),this.camera);
    this.base.updateMatrixWorld(true);const hit=this.raycaster.intersectObjects(this.baseHitMeshes,false)[0];if(!hit)return false;
    const meshes=balls.filter(ball=>ball.type!=='ghost'&&!ball.heldBy).map(ball=>this.meshes.get(`ball:${ball.id}`)).filter(Boolean);
    const ballHit=this.raycaster.intersectObjects(meshes,false)[0];return !ballHit||hit.distance<ballHit.distance;
  }
  setBaseLevel(level=1){
    if(level===this.baseLevelMark)return;this.baseLevelMark=level;
    this.baseHitMeshes[1].material=this.mat(level>=5?'diamond':level>=4?'gold':level>=3?'iron':'iron');
    for(const [index,marker] of this.baseTierMarkers.entries())marker.visible=index<level-1;
    this.beam.material.color.set(level>=4?'#a5c7ff':'#a4ffe1').multiplyScalar(2);
  }
  makeWorker(worker){
    const model=createMobModel(worker.role==='miner'?'toolsmith':'villager',this.textures);
    for(const material of model.userData.materials||[])if(material.emissive)material.userData.baseEmissive=material.emissive.clone();
    const tool=new THREE.Group();tool.position.set(5,-7,7);tool.rotation.z=-.25;
    tool.add(this.cube(1.8,16,1.8,this.mat('wood-planks'),0,2,0));
    const head=new THREE.Group();tool.add(head);
    if(worker.role==='miner'){
      head.add(this.cube(15,2.6,2.8,this.mat('stone'),0,10,0));head.add(this.cube(2.7,4,2.8,this.mat('stone'),-6.8,7.8,0));head.add(this.cube(2.7,4,2.8,this.mat('stone'),6.8,7.8,0));
    }else{head.add(this.cube(7.5,7,2.8,this.mat('stone'),-3.7,9,0));head.add(this.cube(2.2,4,2.8,this.mat('stone'),2.1,10,0));}
    (model.userData.bones.arms||model).add(tool);model.userData.workerTool=tool;model.userData.toolHead=head;
    return model;
  }
  weatherStrike(event){this.realmEffects.strike(event,this.lastRenderTime);}
  pickPortal(x,y){this.raycaster.setFromCamera(new THREE.Vector2(x/this.width*2-1,1-y/this.height*2),this.camera);return this.realmEffects.pick(this.raycaster);}
  setEnvironment(state){
    const stage=state.stage||'overworld',weather=state.weather||'sunny',key=`${stage}:${weather}`;if(key===this.environmentKey)return;this.environmentKey=key;
    const nether=stage==='nether',end=stage==='end';
    if(nether||end){const name=nether?'netherrack':'end-stone';let map=this.tiledMaps.get(name);if(!map){map=new THREE.Texture(this.textures[name]?.image);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(25,18);map.magFilter=map.minFilter=THREE.NearestFilter;map.colorSpace=THREE.SRGBColorSpace;if(map.image)map.needsUpdate=true;this.tiledMaps.set(name,map);}
      const matKey=`terrain:${name}`;if(!this.materials.has(matKey))this.materials.set(matKey,new THREE.MeshStandardMaterial({map,roughness:.95}));this.floorMesh.material=this.materials.get(matKey);this.islandMesh.material=this.mat(nether?'blackstone':'end-stone');
    }else{this.floorMesh.material=this.grassMaterial;this.islandMesh.material=this.mat('dirt');}
    this.atmosphere.setConditions(stage,weather);
    const night=weather==='night',storm=weather==='storm',rain=weather==='rain';
    this.sunLight.color.set(nether?'#ff8050':end?'#b69bd6':night?'#9fbbed':'#ffd49a');this.sunLight.intensity=nether?1.4:end?.8:night?.45:storm?.9:rain?1.6:3.1;
    this.skyLight.color.set(nether?'#b54e50':end?'#80669d':night?'#5476aa':storm?'#809bb7':'#b6d5ff');this.skyLight.intensity=nether?.8:end?.85:night?.65:.95;
  }
  toggleQuality(){
    this.quality=this.quality==='high'?'low':'high';const high=this.quality==='high';this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,high?1.75:1.25));
    for(const light of this.shadowLights){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapSize.set(high?2048:1024,high?2048:1024);light.shadow.needsUpdate=true;}
    this.resize(this.width,this.height);return this.quality;
  }
  setCamera(){
    this.camera.position.set(Math.sin(this.azimuth)*1050,1000,Math.cos(this.azimuth)*830);
    const bounds=computeArenaFrustum({width:this.width,height:this.height,cameraPosition:this.camera.position,zoom:1.18});
    for(const key of ['left','right','top','bottom'])this.camera[key]=bounds[key];this.camera.zoom=1;this.camera.lookAt(0,12,0);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  }
  rotate(){this.azimuth+=Math.PI/4;this.setCamera();}
  screenToWorld(x,y){const mouse=new THREE.Vector2(x/this.width*2-1,1-y/this.height*2);this.raycaster.setFromCamera(mouse,this.camera);const p=new THREE.Vector3();if(!this.raycaster.ray.intersectPlane(this.plane,p))return{x:500,y:360};return{x:p.x+500,y:p.z+360};}
  project(x,y,h=0){const p=groundPosition(x,y,h).project(this.camera);return{x:(p.x+1)/2*this.width,y:(1-p.y)/2*this.height};}
  pickBall(x,y,balls,touch=false){
    this.raycaster.setFromCamera(new THREE.Vector2(x/this.width*2-1,1-y/this.height*2),this.camera);
    const eligible=balls.filter(b=>b.type!=='ghost'&&!b.heldBy);const meshes=eligible.map(b=>this.meshes.get(`ball:${b.id}`)).filter(Boolean);
    const hit=this.raycaster.intersectObjects(meshes,false)[0];if(hit)return eligible.find(b=>`ball:${b.id}`===hit.object.userData.key)||null;
    let best=null,dist=touch?25:14;
    for(const b of eligible){const p=this.project(b.x,b.y,b.r);const d=Math.hypot(p.x-x,p.y-y);if(d<dist){best=b;dist=d;}}return best;
  }
  makeResource(resource){
    const g=new THREE.Group();
    if(resource.kind==='tree'){
      g.add(this.cube(18,65,18,this.mat('oak-log'),0,32,0));
      const leaves=this.mat('oak-leaves',0x5c9637,true);g.add(this.cube(67,39,67,leaves,0,77,0));g.add(this.cube(46,21,46,leaves,0,105,0));
    }else{const material={diamond:'diamond-ore',obsidian:'obsidian',gold:'nether-gold-ore',quartz:'nether-quartz-ore',netherite:'ancient-debris-side',endPearl:'obsidian',stone:'stone'}[resource.material]||'iron-ore';g.add(this.cube(32,32,32,this.mat(material),0,16,0));
      if(resource.material==='endPearl'){const pearl=new THREE.Sprite(new THREE.SpriteMaterial({map:this.textures['ender-pearl'],transparent:true,depthWrite:false}));pearl.position.y=44;pearl.scale.set(25,25,1);g.add(pearl);}
      const segments=[[-14,32.2,-8,-2,32.2,-2],[-2,32.2,-2,5,32.2,9],[5,32.2,9,14,32.2,13],[-2,32.2,-2,7,32.2,-14],[7,32.2,-14,13,32.2,-10],[-10,29,16.2,-3,18,16.2],[-3,18,16.2,4,13,16.2],[4,13,16.2,0,2,16.2],[-3,18,16.2,13,23,16.2],[16.2,31,-9,16.2,20,-3],[16.2,20,-3,16.2,13,6],[16.2,13,6,16.2,2,11],[16.2,20,-3,16.2,15,-13]];
      const crackGeometry=new THREE.BufferGeometry();crackGeometry.setAttribute('position',new THREE.Float32BufferAttribute(segments.flat(),3));
      const cracks=new THREE.LineSegments(crackGeometry,new THREE.LineBasicMaterial({color:'#1d1921',transparent:true,opacity:.8}));cracks.visible=false;g.add(cracks);g.userData.cracks=cracks;
    }
    return g;
  }
  disposeObject(object){
    const shared=new Set(this.materials.values()),geometries=new Set(),materials=new Set();
    object.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      for(const material of Array.isArray(o.material)?o.material:[o.material])if(material&&!shared.has(material))materials.add(material);
    });
    geometries.forEach(geometry=>geometry.dispose());
    // Skins belong to the renderer's texture cache, not to an individual mob.
    materials.forEach(material=>material.dispose());
  }
  sync(state,t,dt){
    const active=new Set();
    const track=(key,create,update)=>{active.add(key);let mesh=this.meshes.get(key);if(!mesh){mesh=create();mesh.userData.key=key;this.meshes.set(key,mesh);this.scene.add(mesh);}update(mesh);};
    for(const b of state.balls){
      const signature=JSON.stringify([b.type,b.r,b.traits,b.fusionLevel]);const previous=this.meshes.get(`ball:${b.id}`);
      if(previous&&previous.userData.ballSignature!==signature){this.scene.remove(previous);this.disposeObject(previous);this.meshes.delete(`ball:${b.id}`);}
      track(`ball:${b.id}`,()=>{
      const m=this.cube(b.r*2,b.r*2,b.r*2,this.blockMaterial(b.type,b.traits||[],b.fusionLevel||0));m.userData.ballSignature=signature;
      if(b.type==='ghost'){m.material=m.material.clone();m.material.transparent=true;m.material.opacity=.65;}
      if(b.type==='slime'||(b.traits||[]).includes('slime')){const core=this.cube(b.r*1.05,b.r*1.05,b.r*1.05,new THREE.MeshStandardMaterial({color:'#80bf58',roughness:.4}),0,0,0);m.add(core);}
      if(b.type!=='ghost'){const edges=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:b.fusionLevel?'#ffe798':b.type==='slime'?'#b8f28a':'#e4ecc5',transparent:true,opacity:b.fusionLevel?.95:.65}));m.add(edges);}
      const flames=new THREE.Group();
      for(let i=0;i<4;i++){const flame=this.cube(5,12+i%2*6,5,new THREE.MeshBasicMaterial({color:new THREE.Color(i%2?'#ffd94e':'#ff8129').multiplyScalar(2.5)}),(i%2*2-1)*b.r*.6,b.r+7,(Math.floor(i/2)*2-1)*b.r*.6);flame.castShadow=false;flames.add(flame);}
      flames.visible=false;m.add(flames);m.userData.flames=flames;return m;
    },m=>{
      const held=b.heldBy?state.enemies.find(e=>e.id===b.heldBy):null;
      if(held){const dx=500-held.x,dy=360-held.y,len=Math.hypot(dx,dy)||1;m.position.copy(groundPosition(held.x+dx/len*27,held.y+dy/len*27,43));}
      else m.position.copy(groundPosition(b.x,b.y,b.r+1));m.visible=true;
      if(!b.heldBy){m.rotation.x+=b.vy*dt/(b.r*4);m.rotation.z-=b.vx*dt/(b.r*4);}
      const slime=b.type==='slime'||(b.traits||[]).includes('slime')||(b.ricochet?.traits||[]).includes('slime');
      const bounceCount=b.ricochet?.count||0;if(slime&&bounceCount>(m.userData.bounceCount||0))m.userData.squash=.18;m.userData.bounceCount=bounceCount;
      m.userData.squash=Math.max(0,(m.userData.squash||0)-dt);const squash=slime?Math.sin(m.userData.squash/.18*Math.PI)*.14:0;m.scale.set(1+squash*.5,1-squash,1+squash*.5);
      m.userData.flames.visible=describeRicochet(b).burning;m.userData.flames.scale.y=.8+Math.sin(t*16)*.2;
    });
      const chain=describeRicochet(b),caught=describeCatch(b);
      if(((chain.active&&chain.count>0)||caught.active)&&!b.heldBy&&!b.aimHeld)track(`ricochet:${b.id}`,()=>this.makeRicochetAura(b),aura=>{
        aura.position.copy(groundPosition(b.x,b.y));
        const shared=chain.participants.length>1,color=shared?'#a7f4f0':'#ffe49e';
        aura.userData.rim.material.color.set(color);aura.userData.rim.material.opacity=.5+Math.min(chain.count,10)*.035;
        const radius=b.r+11;
        for(const [i,[trait,dot]] of Object.entries(aura.userData.traits).entries()){
          dot.visible=shared&&chain.traits.includes(trait);const angle=t*2+i*Math.PI*2/Object.keys(aura.userData.traits).length;
          dot.position.set(Math.cos(angle)*radius,b.r+6+Math.sin(angle*2)*3,Math.sin(angle)*radius);dot.rotation.set(t,t*.6,0);
        }
        const trail=aura.userData.trail,speed=Math.hypot(b.vx,b.vy),length=Math.min(65,speed*.075),positions=trail.geometry.attributes.position;
        positions.setXYZ(0,0,b.r,0);positions.setXYZ(1,speed?-b.vx/speed*length:0,b.r,speed?-b.vy/speed*length:0);positions.needsUpdate=true;trail.visible=speed>40;trail.material.color.set(color);
      });
    }
    for(const e of [...state.enemies,...(state.allies||[])]){
      track(`mob:${e.id}`,()=>{const model=createMobModel(enemyAliases[e.kind]||e.kind,this.textures);for(const material of model.userData.materials||[])if(material.emissive)material.userData.baseEmissive=material.emissive.clone();return model;},m=>{
        m.position.copy(groundPosition(e.x,e.y));
        const kind=enemyAliases[e.kind]||e.kind;
        const size=['slime','magma_cube'].includes(kind)?e.r/17:kind==='dragon'?1:kind==='wither'?1:kind==='warden'?1.1:1;
        m.scale.setScalar(size);
        const attracted=e.attractedTo!=null?state.balls.find(ball=>ball.id===e.attractedTo):null;
        if(kind==='zombified_piglin'&&!state.piglinAggro)m.rotation.y=Math.PI/2-(e.wanderAngle||0);
        else if(kind!=='dragon')m.rotation.y=Math.atan2((attracted?.x??500)-e.x,(attracted?.y??360)-e.y);else m.rotation.y=t*.35;
        m.userData.animate?.(t,Math.hypot(e.vx||0,e.vy||0)>.2||state.phase==='playing');
        if(kind==='enderman'&&state.qte?.enemyId===e.id){for(const name of ['leftArm','rightArm'])if(m.userData.bones?.[name])m.userData.bones[name].rotation.x=-.65;}
        const flash=e.flash>0||(e.fuse>0&&Math.sin(t*25)>0);
        for(const material of m.userData.materials||[])if(material.emissive){material.emissive.copy(material.userData.baseEmissive||new THREE.Color());if(flash)material.emissive.add(new THREE.Color(0x442f20));}
        if(m.userData.shield)m.userData.shield.visible=(e.shield||0)>0;
      });
    }
    for(const worker of state.workers||[]){
      track(`worker:${worker.id}`,()=>this.makeWorker(worker),model=>{
        const target=(state.resources||[]).find(resource=>resource.id===worker.targetId&&resource.hp>0);
        const speed=Math.hypot(worker.vx||0,worker.vy||0),working=!!target&&Math.hypot(target.x-worker.x,target.y-worker.y)<(target.r||18)+(worker.r||13)+16;
        model.position.copy(groundPosition(worker.x,worker.y));model.userData.animate?.(t,Math.min(1,speed/45));
        for(const material of model.userData.materials||[])if(material.emissive){material.emissive.copy(material.userData.baseEmissive);if(worker.flash>0)material.emissive.add(new THREE.Color('#55251d'));}
        if(target)model.rotation.y=Math.atan2(target.x-worker.x,target.y-worker.y);else if(speed>1)model.rotation.y=Math.atan2(worker.vx,worker.vy);
        if(model.userData.bones.arms&&working)model.userData.bones.arms.rotation.x=-.4+Math.sin(t*12)*.6;
        const tier=worker.tool||'wood';if(model.userData.toolTier!==tier){model.userData.toolTier=tier;const material=this.mat({wood:'wood-planks',stone:'stone',iron:'iron',diamond:'diamond',netherite:'blackstone'}[tier]||'wood-planks');for(const part of model.userData.toolHead.children)part.material=material;}
      });
    }
    for(const r of state.resources||[]){track(`resource:${r.id}`,()=>this.makeResource(r),m=>{
      m.position.copy(groundPosition(r.x,r.y,Math.max(0,r.fallTimer||0)*190));
      const hit=Math.max(0,r.flash||0)/.12;m.scale.y=1+hit*.075;m.rotation.z=Math.sin(t*55)*hit*.045;
      if(m.userData.cracks){const damage=1-r.hp/r.maxHp;m.userData.cracks.visible=damage>0;m.userData.cracks.geometry.setDrawRange(0,Math.min(26,Math.ceil(damage*13)*2));}
      if(r.kind==='tree'){m.children[1].rotation.z=Math.sin(t*1.3+r.x)*.018;m.children[2].rotation.z=Math.sin(t*1.1+r.y)*.025;}
    });}
    for(const crystal of state.crystals||[]){if(crystal.hp<=0)continue;track(`crystal:${crystal.id}`,()=>{const model=createEndCrystalModel(this.textures,{shielded:crystal.shield>0});model.scale.setScalar(3);return model;},m=>{m.position.copy(groundPosition(crystal.x,crystal.y));m.userData.setShielded?.(crystal.shield>0);m.userData.animate?.(t);});}
    for(const structure of state.structures||[]){track(`structure:${structure.id}`,()=>{const g=new THREE.Group();g.add(this.cube(22,8,22,this.mat('stone'),0,4,0));g.add(this.cube(5,65,5,this.mat('lightning-rod'),0,39,0));g.add(this.cube(11,8,11,this.mat('lightning-rod'),0,74,0));return g;},m=>m.position.copy(groundPosition(structure.x,structure.y)));}
    for(const p of state.projectiles||[]){track(`projectile:${p.id}`,()=>{
      if(p.kind==='arrow')return this.cube(3,3,20,new THREE.MeshLambertMaterial({color:'#b1a38a'}));
      if(p.kind==='trident'){const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:'#77d6ce',metalness:.25,roughness:.4});g.add(this.cube(3,3,30,mat));for(const x of [-5,0,5])g.add(this.cube(2,2,13,mat,x,0,20));return g;}
      return new THREE.Mesh(new THREE.SphereGeometry(p.kind==='snowball'?5:8,6,4),new THREE.MeshBasicMaterial({color:new THREE.Color(p.kind==='snowball'?'#eaf7ff':p.kind==='fireball'?'#ff8a27':'#796d8b').multiplyScalar(p.kind==='fireball'?2.5:1)}));
    },m=>{m.position.copy(groundPosition(p.x,p.y,22));m.rotation.y=Math.atan2(p.vx,p.vy);if(p.kind==='fireball'&&p.reflected&&m.material?.color)m.material.color.set('#b8edff').multiplyScalar(2);});}
    for(const [key,mesh] of this.meshes){if(!active.has(key)){this.scene.remove(mesh);this.meshes.delete(key);this.disposeObject(mesh);}}
    const orbs=(state.experienceOrbs||[]).slice(0,160);this.xpOrbs.count=orbs.length;
    orbs.forEach((orb,i)=>{this.xpDummy.position.copy(groundPosition(orb.x,orb.y,9+Math.sin(t*3+orb.id)*2));this.xpDummy.rotation.set(.3,t*1.2,.15);this.xpDummy.scale.setScalar(Math.min(1.6,.85+Math.sqrt(orb.value||1)*.12));this.xpDummy.updateMatrix();this.xpOrbs.setMatrixAt(i,this.xpDummy.matrix);});this.xpOrbs.instanceMatrix.needsUpdate=true;
    this.shield.visible=state.shield>0;this.beam.material.opacity=.11+Math.sin(t*1.6)*.018;
  }
  updateUpgradeTargets(state,ids,hoverId){
    this.upgradeTargets.count=0;if(!ids)return;
    const eligible=new Set(ids),dummy=this.targetDummy;
    for(const ball of state.balls){if(!eligible.has(ball.id)||this.upgradeTargets.count>=18)continue;
      dummy.position.copy(groundPosition(ball.x,ball.y,ball.r+1));dummy.scale.setScalar(ball.r*2+7);dummy.updateMatrix();
      const i=this.upgradeTargets.count++;this.upgradeTargets.setMatrixAt(i,dummy.matrix);this.targetColor.set(ball.id===hoverId?'#fff5b0':'#a3ff78');this.upgradeTargets.setColorAt(i,this.targetColor);
    }
    this.upgradeTargets.instanceMatrix.needsUpdate=true;if(this.upgradeTargets.instanceColor)this.upgradeTargets.instanceColor.needsUpdate=true;
  }
  render(state,t,dt,{aim,hoverId,hoverBase=false,shop=false,shopTab='materials',station=null,crafting=false,upgradeTargetIds=null}={}){
    this.updateUpgradeTargets(state,upgradeTargetIds,hoverId);
    this.baseOutline.visible=hoverBase&&!aim?.down&&state.phase==='playing';this.setBaseLevel(state.beacon?.level||1);
    this.lastRenderTime=t;this.setEnvironment(state);this.realmEffects.update(state,t);
    this.atmosphere.update(t,this.quality);
    if(crafting){if(!this.craftingScene){this.craftingScene=createCraftingScene(this.textures,this.atmosphere.environment);this.craftingScene.resize(this.width,this.height);this.craftingScene.setRecipe(this.selectedRecipe);}this.craftingScene.update(t);this.pipeline.render(this.craftingScene.scene,this.craftingScene.camera,this.quality);return;}
    if(station){let bench=this.workbenches[station];if(!bench){bench=createWorkbenchScene(station,this.textures,this.atmosphere.environment);bench.resize(this.width,this.height);this.workbenches[station]=bench;}bench.update(t);this.pipeline.render(bench.scene,bench.camera,this.quality);return;}
    if(shop||(state.phase==='upgrade'&&!state.upgradeTarget)){
      const kind=shop&&shopTab!=='books'?'toolsmith':'librarian';Object.entries(this.merchants).forEach(([k,m])=>{m.visible=k===kind;m.userData.animate?.(t,false);});
      this.shopItems.forEach((m,i)=>{m.rotation.y=t*.15+i*.2;});this.pipeline.render(this.shopScene,this.shopCamera,this.quality);return;
    }
    const s=state.phase==='ready'?this.preview:state;this.sync(s,t,dt);this.buildEffects.update(state,t,dt,aim);
    this.cue.visible=!!aim?.down;this.aimLine.visible=!!aim?.down;this.selection.visible=false;
    const selected=s.balls.find(b=>b.id===(aim?.down?aim.ballId:hoverId));
    if(selected){this.selection.visible=true;this.selection.position.copy(groundPosition(selected.x,selected.y,.8));}
    if(aim?.down&&selected){
      const rank=Math.max(0,['wood','bone','end','blaze'].indexOf(s.activeRod||'wood'));this.rodBody.material.color.set(['#8c6033','#e6e1c5','#edf3da','#f4b530'][rank]);this.rodBody.material.emissive.setHex(rank===3?0x664000:0);
      const dx=Math.cos(aim.angle),dy=Math.sin(aim.angle),pull=selected.r+20+aim.charge*65;
      this.cue.position.copy(groundPosition(selected.x-dx*pull,selected.y-dy*pull,selected.r+3));this.cue.rotation.y=Math.atan2(-dx,-dy);
      const segments=aim.mode==='beam'?aim.preview?.segments:null;
      const points=segments?.length?[segments[0].from,...segments.map(segment=>segment.to)]:this.trajectory(s,selected,aim.angle,aim.charge);
      this.aimLine.material.color.set(aim.mode==='beam'?(aim.charge>=1?'#d9ffb1':'#d5abff'):'#fff2a6');
      this.aimLine.geometry.dispose();this.aimLine.geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>groundPosition(p.x,p.y,selected.r)));
      this.aimLine.computeLineDistances();
    }
    this.pipeline.render(this.scene,this.camera,this.quality);
    this.realmEffects.overlay(this.renderer,state,t);
  }
  trajectory(s,ball,angle,power){
    let x=ball.x,y=ball.y,vx=Math.cos(angle),vy=Math.sin(angle),remaining=230+power*380;const points=[{x,y}];
    for(let seg=0;seg<3&&remaining>0;seg++){
      const tx=vx>0?(970-ball.r-x)/vx:vx<0?(30+ball.r-x)/vx:Infinity,ty=vy>0?(690-ball.r-y)/vy:vy<0?(30+ball.r-y)/vy:Infinity;
      let distance=Math.min(remaining,tx,ty),hit=null;
      for(const c of [{x:500,y:360,r:42,base:true},...s.enemies,...(s.resources||[]).filter(r=>!(r.fallTimer>0)),...(s.crystals||[]).filter(c=>c.hp>0),...s.balls.filter(b=>b.id!==ball.id&&!b.heldBy)]){
        const ox=x-c.x,oy=y-c.y,radius=c.r+ball.r,dot=ox*vx+oy*vy,disc=dot*dot-(ox*ox+oy*oy-radius*radius);
        if(disc>=0){const entry=-dot-Math.sqrt(disc);if(entry>.2&&entry<distance){distance=entry;hit=c;}}
      }
      x+=vx*distance;y+=vy*distance;remaining-=distance;points.push({x,y});
      if(hit&&!hit.base)break;
      if(hit?.base){const nx=(x-hit.x)/(hit.r+ball.r),ny=(y-hit.y)/(hit.r+ball.r),dot=vx*nx+vy*ny;vx-=2*dot*nx;vy-=2*dot*ny;x+=vx*.3;y+=vy*.3;}
      else if(distance===tx)vx=-vx;else if(distance===ty)vy=-vy;else break;
    }return points;
  }
  portrait(kind){
    this.portraitRenderer ||= new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});this.portraitRenderer.setSize(260,250);this.portraitRenderer.setClearColor(0x000000,0);
    this.portraitRenderer.toneMapping=THREE.ACESFilmicToneMapping;this.portraitRenderer.toneMappingExposure=1.08;
    const scene=new THREE.Scene();this.addLights(scene,false);const mob=createMobModel(kind,this.textures);scene.add(mob);mob.rotation.y=-.4;
    const camera=new THREE.PerspectiveCamera(40,260/250,1,1000);camera.position.set(30,85,220);camera.lookAt(0,43,0);this.portraitRenderer.render(scene,camera);const url=this.portraitRenderer.domElement.toDataURL('image/png');this.disposeObject(mob);return url;
  }
}
