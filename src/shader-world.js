import * as THREE from '../vendor/three.module.js';

// Lightweight, self-contained atmosphere. Everything outside the island is
// decoration; the billiards collision bounds remain owned by core.js.
export function createShaderWorld(scene, renderer, textures = {}) {
  const sunDirection = new THREE.Vector3(-.6, .7, .45).normalize();
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDirection: { value: sunDirection } },
    vertexShader: `varying vec3 vDirection;
      void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vDirection;uniform vec3 sunDirection;
      void main(){
        vec3 d=normalize(vDirection);
        float h=clamp(d.y*.7+.25,0.,1.);
        vec3 sky=mix(vec3(.42,.55,.57),vec3(.16,.37,.61),pow(h,.6));
        float horizon=pow(1.-abs(d.y),6.);
        sky=mix(sky,vec3(.83,.72,.49),horizon*.32);
        float alignment=max(0.,dot(d,sunDirection));
        sky+=vec3(1.,.69,.30)*pow(alignment,18.)*.32;
        sky+=vec3(5.,3.8,2.1)*smoothstep(.9988,.9994,alignment);
        gl_FragColor=vec4(sky,1.);
      }`
  });
  const environmentScene = new THREE.Scene();
  environmentScene.add(new THREE.Mesh(new THREE.SphereGeometry(1000,32,16),skyMaterial));
  const generator = new THREE.PMREMGenerator(renderer);
  const environmentTarget = generator.fromScene(environmentScene,.04,.1,2000);
  generator.dispose();
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = .55;
  scene.background = new THREE.Color('#7fabae');
  scene.fog = new THREE.FogExp2('#8eb6b7',.00018);

  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value:0 }, sunDirection: { value:sunDirection },realm:{value:0},darkness:{value:0},lavaMap:{value:textures['lava-still']||null} },
    vertexShader: `varying vec3 vWorld;
      void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `uniform float time;uniform vec3 sunDirection;uniform float realm;uniform float darkness;uniform sampler2D lavaMap;varying vec3 vWorld;
      void main(){
        vec2 p=vWorld.xz;
        float a=p.x*.028+p.y*.012+time*.65;
        float b=p.x*-.015+p.y*.036-time*.48;
        float c=p.x*.075+p.y*-.049+time*.9;
        vec3 normal=normalize(vec3(-cos(a)*.12+cos(b)*.075-cos(c)*.055,1.,-cos(a)*.05-cos(b)*.16+cos(c)*.04));
        vec3 viewDir=normalize(cameraPosition-vWorld);
        float fresnel=pow(1.-max(0.,dot(viewDir,normal)),4.);
        float sparkle=pow(max(0.,dot(normal,normalize(sunDirection+viewDir))),110.);
        vec3 deep=vec3(.037,.15,.19), sky=vec3(.31,.52,.56);
        vec3 color=mix(deep,sky,.25+fresnel*.7);
        color+=vec3(1.5,1.04,.49)*sparkle*.7;
        color+=vec3(.018,.045,.044)*(sin(a)*sin(b));
        vec2 edge=abs(p)-vec2(500.,360.);
        float shore=length(max(edge,0.));
        float foam=(1.-smoothstep(0.,24.,shore))*smoothstep(-.25,.6,sin(shore*.3-time*.7+sin(p.x*.03)));
        color=mix(color,vec3(.39,.62,.58),foam*.35);
        float fog=1.-exp(-length(cameraPosition-vWorld)*.00016);
        color=mix(color,vec3(.26,.42,.44),fog*.38);
        color*=1.-darkness*.8;
        if(realm>.5){
          float frame=19.-abs(mod(floor(time*10.),38.)-19.);
          vec2 uv=fract(p/64.+vec2(time*.004,-time*.002));
          vec3 lava=texture2D(lavaMap,vec2(uv.x,(uv.y+frame)/20.)).rgb;
          color=lava*1.7+vec3(.13,.014,.001);
          color=mix(color,vec3(.24,.045,.018),fog*.3);
        }
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(10000,10000),waterMaterial);
  water.rotation.x=-Math.PI/2;water.position.y=-48;scene.add(water);

  // Distant, low-contrast block islands give the haze a depth reference.
  const distant = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({color:'#465c4c',roughness:1});
  const turf = new THREE.MeshStandardMaterial({color:'#647e48',roughness:1});
  for(const [x,z,w,d,h] of [[-1100,-600,260,190,60],[980,-800,360,260,90],[1250,450,240,190,50],[-1150,800,310,180,45]]) {
    const slab=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),rock);slab.position.set(x,-52+h/2,z);slab.receiveShadow=true;distant.add(slab);
    const grass=new THREE.Mesh(new THREE.BoxGeometry(w+2,8,d+2),turf);grass.position.set(x,-48+h,z);distant.add(grass);
  }
  scene.add(distant);

  const positions = new Float32Array(72*3);
  for(let i=0;i<72;i++){positions[i*3]=(Math.sin(i*73.3)*.5+.5)*930-465;positions[i*3+1]=12+(Math.sin(i*19.2)*.5+.5)*90;positions[i*3+2]=Math.sin(i*39.7)*320;}
  const particles=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3)),new THREE.PointsMaterial({color:'#ffe8af',size:1.8,transparent:true,opacity:.34,depthWrite:false}));scene.add(particles);

  return {
    environment:environmentTarget.texture,
    setConditions(stage,weather){
      const nether=stage==='nether',end=stage==='end';water.visible=!end;distant.visible=!nether&&!end;
      waterMaterial.uniforms.realm.value=nether?1:0;waterMaterial.uniforms.darkness.value=weather==='night'?.8:weather==='storm'?.45:weather==='rain'?.2:0;
      const fogColor=end?'#241835':nether?'#51251f':weather==='night'?'#21394f':weather==='storm'?'#6c8390':'#8eb6b7';
      scene.background.set(fogColor);scene.fog.color.set(fogColor);scene.fog.density=end?.00055:nether?.00045:weather==='storm'?.00032:.00018;
      scene.environmentIntensity=end?.25:nether?.28:weather==='night'?.25:.55;
    },
    update(time,quality){waterMaterial.uniforms.time.value=time;particles.rotation.y=Math.sin(time*.035)*.02;particles.position.y=Math.sin(time*.18)*3;particles.visible=quality==='high';},
    dispose(){environmentTarget.dispose();environmentScene.children[0].geometry.dispose();skyMaterial.dispose();water.geometry.dispose();waterMaterial.dispose();distant.children.forEach(m=>m.geometry.dispose());rock.dispose();turf.dispose();particles.geometry.dispose();particles.material.dispose();}
  };
}
