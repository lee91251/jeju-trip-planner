/* ===== 제주 3D — 실제 고도(DEM) + 위성 텍스처 (Three.js) ===== */
// bbox (fetch_terrain.py 출력과 일치)
const B = { lng0:126.03516, lng1:127.08984, lat0:32.99024, lat1:33.72434 };
const W = 216, D = 180;                 // 평면 크기(scene units)
const lngSpan = B.lng1-B.lng0, latSpan = B.lat1-B.lat0;
const lngMid = (B.lng0+B.lng1)/2, latMid = (B.lat0+B.lat1)/2;
const MPERUNIT = 98000 / W;             // 1 unit ≈ 454m
const EXAG = 8;                         // 고도 과장(자연스럽게 — 피노키오 방지)
// lng/lat → scene (핀 배치용)
const toX = lng => (lng - lngMid)/lngSpan * W;
const toZ = lat => -(lat - latMid)/latSpan * D;

const scene = new THREE.Scene();
(function(){
  const cnv=document.createElement('canvas'); cnv.width=4; cnv.height=512;
  const g=cnv.getContext('2d'), grd=g.createLinearGradient(0,0,0,512);
  grd.addColorStop(0,'#01060d'); grd.addColorStop(0.55,'#04101d'); grd.addColorStop(0.85,'#0a2a40'); grd.addColorStop(1,'#0f4258');
  g.fillStyle=grd; g.fillRect(0,0,4,512);
  const tex=new THREE.CanvasTexture(cnv); tex.encoding=THREE.sRGBEncoding; scene.background=tex;
})();
scene.fog = new THREE.FogExp2(0x081a2c, 0.0006);

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 1, 6000);
const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
renderer.outputEncoding = THREE.sRGBEncoding;
document.getElementById('c').appendChild(renderer.domElement);

/* ---- 조명 (위성 텍스처라 부드럽게 + 입체용 키라이트) ---- */
scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x14202a, 0.7));
const key = new THREE.DirectionalLight(0xfff0d6, 1.7);
key.position.set(120, 160, 80); key.castShadow=true;
key.shadow.mapSize.set(2048,2048);
key.shadow.camera.left=-200; key.shadow.camera.right=200; key.shadow.camera.top=200; key.shadow.camera.bottom=-200;
key.shadow.camera.far=900; key.shadow.bias=-0.0005;
scene.add(key);
const rim = new THREE.DirectionalLight(0x5fb0ff, 0.7); rim.position.set(-120,70,-140); scene.add(rim);

/* ---- 둘레 바다 (출렁이는 물결) ---- */
const oceanGeo = new THREE.PlaneGeometry(5200, 5200, 90, 90);
oceanGeo.rotateX(-Math.PI/2);
const ocean = new THREE.Mesh(oceanGeo,
  new THREE.MeshStandardMaterial({ color:0x0c3050, roughness:0.85, metalness:0.1 }));
ocean.position.y = -0.5; ocean.receiveShadow = true; scene.add(ocean);
const oPos = oceanGeo.attributes.position;
const oBaseX = [], oBaseZ = [];
for(let i=0;i<oPos.count;i++){ oBaseX.push(oPos.getX(i)); oBaseZ.push(oPos.getZ(i)); }

/* ---- 카메라 ---- */
const REST_R=126, REST_H=86;
const camTarget = new THREE.Vector3(0, 9, 0);
let orbit=0.5, radius=REST_R, height=REST_H, autoRotate=true, paused=false;
function placeCamera(){
  camera.position.set(camTarget.x+Math.sin(orbit)*radius, camTarget.y+height, camTarget.z+Math.cos(orbit)*radius);
  camera.lookAt(camTarget);
}
placeCamera();
gsap.fromTo({r:430,h:360},{r:430,h:360},{r:REST_R,h:REST_H,duration:3.4,ease:'power2.out',
  onUpdate:function(){const t=this.targets()[0];radius=t.r;height=t.h;}});

const STILL = new URLSearchParams(location.search).has('still');

/* ---- 실제 지형: DEM로 높이, 위성으로 색 ---- */
let terrain=null;
const satTex = new THREE.TextureLoader().load('jeju_sat.jpg', t=>{ t.encoding=THREE.sRGBEncoding; });
const demImg = new Image();
demImg.onload = ()=> buildTerrain();
demImg.onerror = ()=> console.warn('DEM 로드 실패');
demImg.src = 'jeju_dem.png';

function buildTerrain(){
  const cw=demImg.width, ch=demImg.height;
  const cv=document.createElement('canvas'); cv.width=cw; cv.height=ch;
  const cx=cv.getContext('2d'); cx.drawImage(demImg,0,0);
  const data=cx.getImageData(0,0,cw,ch).data;
  function H(u,v){ // u,v 0..1  (u: 서→동, v: 북→남)
    const px=Math.min(cw-1,Math.max(0,Math.round(u*(cw-1))));
    const py=Math.min(ch-1,Math.max(0,Math.round(v*(ch-1))));
    const i=(py*cw+px)*4;
    let h=(data[i]*256+data[i+1]+data[i+2]/256)-32768;
    return h<0?0:h;
  }
  const SX=300, SY=250;
  const geo=new THREE.PlaneGeometry(W,D,SX,SY);
  geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i);
    const u=(x/W)+0.5;          // 서(0)→동(1)
    const v=(z/D)+0.5;          // -z(북)→+z(남) ; z=-D/2(북)→v=0(이미지 위=북) OK
    const h=H(u,v);
    pos.setY(i, h/MPERUNIT*EXAG);
  }
  geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({ map:satTex, roughness:1.0, metalness:0.0 });
  terrain=new THREE.Mesh(geo,mat);
  terrain.castShadow=terrain.receiveShadow=true;
  // 섬을 그룹에 담아 '통째로' 바다에서 들어올림 (꼭대기만 나오는 피노키오 방지)
  landGroup.add(terrain);
  landGroup.position.y = STILL ? 0 : -52;   // 물속에서 시작
  if(!STILL){
    gsap.to(landGroup.position, { y:0, duration:3.6, delay:0.5, ease:'power2.out' });
    waveCtrl.a = 5.0;                                  // 솟아오를 때 물 크게 출렁
    gsap.to(waveCtrl, { a:1.4, duration:4.0, delay:0.6, ease:'power2.out' });  // → 잔잔하게
  }
}
const landGroup = new THREE.Group(); scene.add(landGroup);
const waveCtrl = { a:1.4 };

let last=performance.now(), tsec=0;
function animate(now){
  requestAnimationFrame(animate);
  if(paused) return;
  const dt=Math.min((now-last)/1000,0.05); last=now; tsec+=dt;
  if(autoRotate) orbit += dt*0.05;
  // 바다 물결
  const a=waveCtrl.a;
  for(let i=0;i<oPos.count;i++){
    const x=oBaseX[i], z=oBaseZ[i];
    oPos.setY(i, Math.sin(x*0.012+tsec*1.3)*Math.cos(z*0.015+tsec*1.1)*a + Math.sin(x*0.04+z*0.03+tsec*2)*a*0.3);
  }
  oPos.needsUpdate = true;
  placeCamera();
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
window.__pause=()=>{paused=true;renderer.render(scene,camera);};
window.__resume=()=>{paused=false;last=performance.now();};
