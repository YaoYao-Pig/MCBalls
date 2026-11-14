import * as THREE from '../vendor/three.module.js';

export class RealmEffects {
  constructor(scene,textures){
    this.scene=scene;this.textures=textures;this.portalGroup=null;this.portalKey='';this.lastStage=null;this.arriveTime=-100;this.lastStrike=-100;
    const positions=[],seeds=[],tails=[];
    for(let i=0;i<360;i++){const x=Math.sin(i*73.31)*540,z=Math.sin(i*29.87)*405,seed=(Math.sin(i*17.2)*.5+.5)*490;for(let k=0;k<2;k++){positions.push(x,0,z);seeds.push(seed);tails.push(k);}}
    const rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));rainGeometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));rainGeometry.setAttribute('aTail',new THREE.Float32BufferAttribute(tails,1));
    this.rainMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},opacity:{value:.45}},vertexShader:`attribute float aSeed;attribute float aTail;uniform float time;void main(){vec3 p=position;p.y=mod(aSeed-time*255.,490.)-aTail*27.;p.x+=aTail*4.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`uniform float opacity;void main(){gl_FragColor=vec4(.52,.72,.88,opacity);}`});
    this.rain=new THREE.LineSegments(rainGeometry,this.rainMaterial);this.rain.frustumCulled=false;this.rain.visible=false;scene.add(this.rain);
    this.flash=new THREE.AmbientLight('#cce7ff',0);scene.add(this.flash);
    this.bolt=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:new THREE.Color('#d8f6ff').multiplyScalar(3),transparent:true,opacity:0}));scene.add(this.bolt);
    this.portalMaterial=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,uniforms:{time:{value:0},map:{value:textures['nether-portal']},end:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;uniform sampler2D map;uniform float time;uniform float end;void main(){vec2 p=vUv+vec2(sin(vUv.y*18.+time*2.)*.025,cos(vUv.x*14.+time)*.02);float frame=mod(floor(time*12.),32.);vec3 base=texture2D(map,vec2(fract(p.x),(fract(p.y)+frame)/32.)).rgb;float star=step(.985,fract(sin(dot(floor(vUv*80.),vec2(12.9898,78.233)))*43758.5453));vec3 color=mix(base*1.9+vec3(.18,.025,.3),vec3(.025,.11,.14)+star*vec3(.5,.8,.7),end);gl_FragColor=vec4(color,.93);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
    this.warpScene=new THREE.Scene();this.warpCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.warpMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{time:{value:0},opacity:{value:0},end:{value:0},map:{value:textures['nether-portal']}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:`varying vec2 vUv;uniform float time;uniform float opacity;uniform float end;uniform sampler2D map;void main(){vec2 p=vUv-.5;float a=time*2.+length(p)*4.;p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;vec2 uv=fract(p*2.5+.5);float frame=mod(floor(time*15.),32.);vec3 c=texture2D(map,vec2(uv.x,(uv.y+frame)/32.)).rgb;vec3 glow=mix(vec3(.31,.035,.55),vec3(.04,.32,.28),end);gl_FragColor=vec4(mix(glow,c*1.6,.55),opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});
    this.warpScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.warpMaterial));
  }
  material(name){return new THREE.MeshStandardMaterial({map:this.textures[name],roughness:.75});}
  box(w,h,d,mat,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;this.portalGroup.add(m);return m;}
  buildPortal(portal,t){
    if(this.portalGroup){this.scene.remove(this.portalGroup);this.portalGroup.traverse(o=>{o.geometry?.dispose();if(o.material&&o.material!==this.portalMaterial){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
    this.portalGroup=new THREE.Group();this.portalCreated=t;this.portalGroup.position.set(portal.x-500,0,portal.y-360);
    if(portal.kind==='end'){
      const side=this.material('end-portal-frame-side'),top=this.material('end-portal-frame-eye');
      for(let i=-1;i<=1;i++)for(const [x,z] of [[i*26,-52],[i*26,52],[-52,i*26],[52,i*26]])this.box(26,22,26,[side,side,top,side,side,side],x,11,z);
      const surface=new THREE.Mesh(new THREE.PlaneGeometry(79,79),this.portalMaterial);surface.rotation.x=-Math.PI/2;surface.position.y=5;surface.userData.portal=true;this.portalGroup.add(surface);
    }else{
      const obsidian=this.material('obsidian');
      this.box(24,144,24,obsidian,-45,72,0);this.box(24,144,24,obsidian,45,72,0);this.box(66,24,24,obsidian,0,12,0);this.box(66,24,24,obsidian,0,132,0);
      const surface=new THREE.Mesh(new THREE.PlaneGeometry(66,108),this.portalMaterial);surface.position.set(0,72,0);surface.userData.portal=true;this.portalGroup.add(surface);
      const light=new THREE.PointLight('#bb70ff',5000,200,2);light.position.set(0,70,20);this.portalGroup.add(light);
    }
    this.scene.add(this.portalGroup);
  }
  strike(event,t){
    const x=event.x-500,z=event.y-360,points=[];
    for(let i=0;i<8;i++)points.push(new THREE.Vector3(x+(i===7?0:Math.sin(i*8.1+t)*18),450-i*63,z+(i===7?0:Math.cos(i*7.2+t)*12)));
    this.bolt.geometry.dispose();this.bolt.geometry=new THREE.BufferGeometry().setFromPoints(points);this.lastStrike=t;
  }
  update(state,t){
    this.rainMaterial.uniforms.time.value=t;this.rain.visible=state.weather==='rain'||state.weather==='storm';this.rainMaterial.uniforms.opacity.value=state.weather==='storm'?.7:.4;
    const flash=Math.max(0,1-(t-this.lastStrike)/.28);this.flash.intensity=flash*2.5;this.bolt.material.opacity=flash;
    const stage=state.stage||'overworld';if(this.lastStage!==null&&stage!==this.lastStage)this.arriveTime=t;this.lastStage=stage;
    const portal=state.portal,key=portal?`${stage}:${portal.kind}:${portal.x}:${portal.y}`:'';
    if(portal&&key!==this.portalKey)this.buildPortal(portal,t);
    this.portalKey=key;
    if(this.portalGroup){this.portalGroup.visible=!!portal;if(portal)this.portalGroup.position.y=-Math.max(0,portal.riseTimer||0)*45;}
    this.portalMaterial.uniforms.time.value=t;this.portalMaterial.uniforms.end.value=portal?.kind==='end'?1:0;
  }
  pick(raycaster){return this.portalGroup?.visible?raycaster.intersectObject(this.portalGroup,true).some(hit=>hit.object.userData.portal):false;}
  overlay(renderer,state,t){
    const transition=state.phase==='transition'?state.transition:null;
    let opacity=0;if(transition){const p=(transition.elapsed||0)/(transition.duration||2.5);opacity=Math.min(1,p/.3)*.97;this.warpMaterial.uniforms.end.value=transition.to==='end'?1:0;}
    else if(t-this.arriveTime<.65)opacity=(1-(t-this.arriveTime)/.65)*.97;
    if(opacity<=0)return;this.warpMaterial.uniforms.time.value=t;this.warpMaterial.uniforms.opacity.value=opacity;
    const autoClear=renderer.autoClear;renderer.autoClear=false;renderer.render(this.warpScene,this.warpCamera);renderer.autoClear=autoClear;
  }
}
