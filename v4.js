/* ===== 제주 3D 디오라마 v4 — 실제 위성+고도로 "솟아오르는 섬" ===== */
const B = { lng0:126.03516, lng1:127.08984, lat0:32.99024, lat1:33.72434 };
const W = 216, D = 180;
const MPERUNIT = 98000 / W;             // 1 unit ≈ 454m
const EXAG = 6.0;                        // 고도 과장(완만한 방패형 한라산)
const STILL = new URLSearchParams(location.search).has('still');

/* 섬 중심 보정 + 타원 클립 반경(이 밖은 바다로 처리) */
const CX = 0, CZ = -4;                   // 위성상 섬 중심 살짝 북쪽
const RX = 96, RZ = 60;                  // 타원 반경(섬을 오려냄)
const BASE_H = 26;                       // 흙 받침 깊이
const WL = 0.9;                          // 수면 높이(이하는 물에 잠김)

const scene = new THREE.Scene();
/* 하늘 그라데이션 배경 */
(function(){
  const cnv=document.createElement('canvas'); cnv.width=4; cnv.height=512;
  const g=cnv.getContext('2d'), grd=g.createLinearGradient(0,0,0,512);
  grd.addColorStop(0,'#bfe3ff'); grd.addColorStop(0.45,'#8fc4ee'); grd.addColorStop(0.8,'#5b9fd4'); grd.addColorStop(1,'#3f86bf');
  g.fillStyle=grd; g.fillRect(0,0,4,512);
  const tex=new THREE.CanvasTexture(cnv); tex.encoding=THREE.sRGBEncoding; scene.background=tex;
})();
scene.fog = new THREE.FogExp2(0x9fcdec, 0.00012);

const VW=()=>window.innerWidth||document.documentElement.clientWidth||1280;
const VH=()=>window.innerHeight||document.documentElement.clientHeight||720;
const camera = new THREE.PerspectiveCamera(42, VW()/VH(), 1, 6000);
const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
renderer.setSize(VW(), VH());
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
renderer.outputEncoding = THREE.sRGBEncoding;
document.getElementById('c').appendChild(renderer.domElement);

/* ---- 조명: 따뜻한 키라이트 + 하늘 + 림 ---- */
scene.add(new THREE.HemisphereLight(0xdcefff, 0x4a5848, 0.65));
const key = new THREE.DirectionalLight(0xfff1d8, 1.9);
key.position.set(-110, 150, 90); key.castShadow=true;
key.shadow.mapSize.set(2048,2048);
key.shadow.camera.left=-160; key.shadow.camera.right=160; key.shadow.camera.top=160; key.shadow.camera.bottom=-160;
key.shadow.camera.near=10; key.shadow.camera.far=700; key.shadow.bias=-0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0x88c4ff, 0.55); rim.position.set(120,60,-120); scene.add(rim);

/* ---- 양식화된 바다(출렁임) ---- */
const oceanGeo = new THREE.PlaneGeometry(4200, 4200, 110, 110);
oceanGeo.rotateX(-Math.PI/2);
const ocean = new THREE.Mesh(oceanGeo,
  new THREE.MeshBasicMaterial({ color:0x0f6aa0 }));   // 조명 무시(양식화 물) → 또렷한 파랑
ocean.position.y = WL; scene.add(ocean);
const oPos = oceanGeo.attributes.position, oBX=[], oBZ=[];
for(let i=0;i<oPos.count;i++){ oBX.push(oPos.getX(i)); oBZ.push(oPos.getZ(i)); }
/* 수평선까지 채우는 먼바다(평평) */
const seaFar = new THREE.Mesh(new THREE.PlaneGeometry(16000,16000).rotateX(-Math.PI/2),
  new THREE.MeshBasicMaterial({ color:0x0f6aa0 }));
seaFar.position.y = WL-0.25; scene.add(seaFar);
/* 더 어두운 심해 바닥(깊이감) */
const deep = new THREE.Mesh(new THREE.PlaneGeometry(4200,4200).rotateX(-Math.PI/2),
  new THREE.MeshBasicMaterial({ color:0x0c3a63 }));
deep.position.y = WL-6; scene.add(deep);

/* ---- 섬: landGroup 안에서 통째로 솟아오름 ---- */
const landGroup = new THREE.Group(); scene.add(landGroup);
const waveCtrl = { a:0.35 };

/* 흙 받침(타원 기둥, 아래로 갈수록 좁아지는 청크) */
(function(){
  const g = new THREE.CylinderGeometry(1, 0.72, BASE_H, 64, 1, false);
  g.translate(0, -BASE_H/2, 0); g.scale(RX*1.0, 1, RZ*1.0);
  const m = new THREE.MeshStandardMaterial({ color:0x6b4a32, roughness:1.0, metalness:0.0, flatShading:true });
  const base = new THREE.Mesh(g, m); base.position.set(CX,0,CZ);
  base.castShadow=true; base.receiveShadow=true; landGroup.add(base);
  // 받침 바닥 캡(어두운 현무암)
  const cap = new THREE.Mesh(new THREE.CircleGeometry(1,64).rotateX(Math.PI/2),
    new THREE.MeshStandardMaterial({color:0x2b2320, roughness:1}));
  cap.scale.set(RX*0.72, 1, RZ*0.72); cap.position.set(CX,-BASE_H,CZ); landGroup.add(cap);
})();

/* 실제 지형 */
const satTex = new THREE.TextureLoader().load('jeju_sat_diorama.jpg', t=>{ t.encoding=THREE.sRGBEncoding; t.anisotropy=8; });
const demImg = new Image();
demImg.onload = buildTerrain;
demImg.onerror = ()=>console.warn('DEM 로드 실패');
demImg.src = 'jeju_dem.png';

function buildTerrain(){
  const cw=demImg.width, ch=demImg.height;
  const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
  const cx=cv.getContext('2d'); cx.drawImage(demImg,0,0);
  const data=cx.getImageData(0,0,cw,ch).data;
  const H=(u,v)=>{
    const px=Math.min(cw-1,Math.max(0,Math.round(u*(cw-1))));
    const py=Math.min(ch-1,Math.max(0,Math.round(v*(ch-1))));
    const i=(py*cw+px)*4;
    let h=(data[i]*256+data[i+1]+data[i+2]/256)-32768;
    return h<0?0:h;
  };
  const SX=360, SY=300;
  const geo=new THREE.PlaneGeometry(W,D,SX,SY);
  geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i);
    const u=(x/W)+0.5, v=(z/D)+0.5;
    // 타원 클립: 섬 밖이면 받침 안으로 떨어뜨려 숨김
    const ed=Math.hypot((x-CX)/RX, (z-CZ)/RZ);
    let y;
    if(ed>1.0){ y = -BASE_H*0.6 - (ed-1)*60; }      // 바다·모서리 → 물밑 받침으로
    else {
      const h=H(u,v);
      y = h/MPERUNIT*EXAG;
      if(ed>0.86){ y *= Math.max(0, (1-ed)/0.14); }  // 가장자리 부드럽게 받침에 합류
    }
    pos.setY(i, y);
  }
  geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({ map:satTex, roughness:0.95, metalness:0.0 });
  const terrain=new THREE.Mesh(geo,mat);
  terrain.castShadow=terrain.receiveShadow=true;
  landGroup.add(terrain);

  const RY = new URLSearchParams(location.search).get('ry');
  landGroup.position.y = STILL ? (RY!==null?parseFloat(RY):0) : -(BASE_H+34);
  if(!STILL){
    gsap.to(landGroup.position, { y:0, duration:3.8, delay:0.4, ease:'power3.out' });
    waveCtrl.a = 2.4;
    gsap.to(waveCtrl, { a:0.5, duration:4.2, delay:0.7, ease:'power2.out' });
  }
}

/* ---- 카메라 (3/4 부감 + 자동 회전 + 드래그) ---- */
const camTarget = new THREE.Vector3(CX, 6, CZ);
let orbit=0.6, radius=140, height=110, autoRotate=true, paused=false, dragging=false, lastX=0;
function placeCamera(){
  camera.position.set(camTarget.x+Math.sin(orbit)*radius, camTarget.y+height, camTarget.z+Math.cos(orbit)*radius);
  camera.lookAt(camTarget);
}
placeCamera();
if(!STILL){
  gsap.fromTo({r:360,h:320},{r:360,h:320},{r:140,h:110,duration:3.8,ease:'power3.out',
    onUpdate:function(){const t=this.targets()[0];radius=t.r;height=t.h;}});
}
const cEl=renderer.domElement;
cEl.addEventListener('pointerdown',e=>{dragging=true;autoRotate=false;lastX=e.clientX;});
addEventListener('pointerup',()=>dragging=false);
addEventListener('pointermove',e=>{ if(dragging){ orbit-=(e.clientX-lastX)*0.006; lastX=e.clientX; }});

let last=performance.now(), tsec=0;
function waves(){
  const a=waveCtrl.a;
  for(let i=0;i<oPos.count;i++){
    const x=oBX[i], z=oBZ[i];
    oPos.setY(i, Math.sin(x*0.009+tsec*1.0)*Math.cos(z*0.011+tsec*0.85)*a + Math.sin(x*0.03+z*0.022+tsec*1.4)*a*0.18);
  }
  oPos.needsUpdate = true;
}
function animate(now){
  if(paused) return;
  const dt=Math.min((now-last)/1000,0.05); last=now; tsec+=dt;
  if(autoRotate) orbit += dt*0.045;
  waves(); placeCamera();
  renderer.render(scene,camera);
  requestAnimationFrame(animate);
}
function stillRender(){ tsec=2.0; waveCtrl.a=1.3; waves(); placeCamera(); renderer.render(scene,camera); }
if(STILL){
  // 정지 프레임: 텍스처/지형 로드 기다렸다 몇 번만 렌더 (루프 없음 → 캡처 빠름)
  setTimeout(stillRender, 600); setTimeout(stillRender, 1600); setTimeout(stillRender, 3000);
} else {
  requestAnimationFrame(animate);
}
function doResize(){ camera.aspect=VW()/VH(); camera.updateProjectionMatrix(); renderer.setSize(VW(),VH()); if(STILL) stillRender(); }
addEventListener('resize', doResize);
addEventListener('load', doResize);
setTimeout(doResize, 60); setTimeout(doResize, 400);
window.__pause=()=>{paused=true;renderer.render(scene,camera);};
window.__resume=()=>{paused=false;last=performance.now();};
