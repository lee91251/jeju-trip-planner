/* ===== 제주 3D 디오라마 v4 — 평면 지도 위에 솟아오르는 입체 제주 ===== */
const B  = { lng0:126.03516, lng1:127.08984, lat0:32.99024, lat1:33.72434 };       // 3D 지형 bbox
const AB = { lng0:125.68359, lng1:127.44141, lat0:32.69487, lat1:34.01624 };       // 평면지도 bbox
const W = 216, D = 180;                              // 지형 평면 크기
const MPERUNIT = 98000 / W;                          // 1 unit ≈ 454m
const EXAG = 6.5;
const FW = W * (AB.lng1-AB.lng0)/(B.lng1-B.lng0);    // 평면지도 크기(지형과 동일 스케일)
const FD = D * (AB.lat1-AB.lat0)/(B.lat1-B.lat0);
const STILL = new URLSearchParams(location.search).has('still');
const VW=()=>window.innerWidth||document.documentElement.clientWidth||1280;
const VH=()=>window.innerHeight||document.documentElement.clientHeight||720;

const scene = new THREE.Scene();
/* 따뜻한 실내(테이블) 분위기 배경 */
(function(){
  const cnv=document.createElement('canvas'); cnv.width=4; cnv.height=512;
  const g=cnv.getContext('2d'), grd=g.createLinearGradient(0,0,0,512);
  grd.addColorStop(0,'#efe9dd'); grd.addColorStop(0.55,'#ded2bd'); grd.addColorStop(1,'#b9a888');
  g.fillStyle=grd; g.fillRect(0,0,4,512);
  const tex=new THREE.CanvasTexture(cnv); tex.encoding=THREE.sRGBEncoding; scene.background=tex;
})();

const camera = new THREE.PerspectiveCamera(40, VW()/VH(), 1, 8000);
const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
renderer.setSize(VW(), VH());
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputEncoding = THREE.sRGBEncoding;
document.getElementById('c').appendChild(renderer.domElement);

/* ---- 조명: 따뜻한 키라이트(섬이 지도에 그림자) + 부드러운 채움 ---- */
scene.add(new THREE.HemisphereLight(0xfff6e8, 0x9a8e78, 0.78));
const key = new THREE.DirectionalLight(0xfff2dc, 1.35);
key.position.set(-150, 220, 120); key.castShadow=true;
key.shadow.mapSize.set(2048,2048);
key.shadow.camera.left=-260; key.shadow.camera.right=260; key.shadow.camera.top=260; key.shadow.camera.bottom=-260;
key.shadow.camera.near=10; key.shadow.camera.far=900; key.shadow.bias=-0.0004;
scene.add(key);

/* ---- 테이블(지도 시트 너머) ---- */
const table = new THREE.Mesh(new THREE.PlaneGeometry(3000,3000).rotateX(-Math.PI/2),
  new THREE.MeshStandardMaterial({ color:0x6f573d, roughness:0.85, metalness:0.0 }));
table.position.y = -0.6; table.receiveShadow = true; scene.add(table);

/* ---- 평면 지도 시트(라벨·지명 있는 종이지도) ---- */
const flatTex = new THREE.TextureLoader().load('jeju_flatmap.jpg', t=>{ t.encoding=THREE.sRGBEncoding; t.anisotropy=8; });
const flat = new THREE.Mesh(new THREE.PlaneGeometry(FW,FD).rotateX(-Math.PI/2),
  new THREE.MeshBasicMaterial({ map:flatTex }));   // 조명 무시 → 지도 색·라벨 또렷
flat.position.y = 0; scene.add(flat);

/* ---- 접지 그림자(섬이 지도에 얹힌 느낌) ---- */
const shadowMat = (function(){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d'); const rg=g.createRadialGradient(128,128,18,128,128,128);
  rg.addColorStop(0,'rgba(35,26,16,0.55)'); rg.addColorStop(0.7,'rgba(35,26,16,0.22)'); rg.addColorStop(1,'rgba(35,26,16,0)');
  g.fillStyle=rg; g.fillRect(0,0,256,256);
  return new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false, opacity:STILL?0.5:0 });
})();
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2), shadowMat);
shadow.scale.set(210,1,150); shadow.position.set(0,0.06,6); scene.add(shadow);

/* ---- 3D 제주(평면 지도 위로 솟아오름) ---- */
const landGroup = new THREE.Group(); scene.add(landGroup);
const satTex  = new THREE.TextureLoader().load('jeju_sat_diorama.jpg', t=>{ t.encoding=THREE.sRGBEncoding; t.anisotropy=8; });
const maskTex = new THREE.TextureLoader().load('jeju_landmask.png');
const demImg = new Image();
demImg.onload = buildTerrain;
demImg.onerror = ()=>console.warn('DEM 로드 실패');
demImg.src = 'jeju_dem.png';
let MAXH = 28;

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
  const SX=380, SY=320;
  const geo=new THREE.PlaneGeometry(W,D,SX,SY);
  geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position;
  let maxy=0;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i), z=pos.getZ(i);
    const u=(x/W)+0.5, v=(z/D)+0.5;
    const y=H(u,v)/MPERUNIT*EXAG;
    pos.setY(i, y); if(y>maxy) maxy=y;
  }
  MAXH=maxy;
  geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({
    map:satTex, alphaMap:maskTex, transparent:true, alphaTest:0.08, depthWrite:true,
    roughness:0.92, metalness:0.0
  });
  const terrain=new THREE.Mesh(geo,mat);
  terrain.castShadow=true; terrain.receiveShadow=true;
  landGroup.add(terrain);

  const RY=new URLSearchParams(location.search).get('ry');
  landGroup.position.y = STILL ? (RY!==null?parseFloat(RY):0) : -(MAXH+4);
  if(!STILL){
    gsap.to(landGroup.position, { y:0, duration:3.6, delay:0.5, ease:'power3.out' });
    gsap.to(shadowMat, { opacity:0.5, duration:2.6, delay:1.2, ease:'power2.out' });
  }
}

/* ---- 카메라 (테이블 위 디오라마를 비스듬히 내려다봄) ---- */
const camTarget = new THREE.Vector3(0, 4, 6);
let orbit=0.5, radius=165, height=100, autoRotate=true, paused=false, dragging=false, lastX=0;
function placeCamera(){
  camera.position.set(camTarget.x+Math.sin(orbit)*radius, camTarget.y+height, camTarget.z+Math.cos(orbit)*radius);
  camera.lookAt(camTarget);
}
placeCamera();
if(!STILL){
  gsap.fromTo({r:300,h:240},{r:300,h:240},{r:165,h:100,duration:3.6,ease:'power3.out',
    onUpdate:function(){const t=this.targets()[0];radius=t.r;height=t.h;}});
}
const cEl=renderer.domElement;
cEl.addEventListener('pointerdown',e=>{dragging=true;autoRotate=false;lastX=e.clientX;});
addEventListener('pointerup',()=>dragging=false);
addEventListener('pointermove',e=>{ if(dragging){ orbit-=(e.clientX-lastX)*0.006; lastX=e.clientX; }});

let last=performance.now();
function animate(now){
  if(paused) return;
  const dt=Math.min((now-last)/1000,0.05); last=now;
  if(autoRotate) orbit += dt*0.04;
  placeCamera(); renderer.render(scene,camera);
  requestAnimationFrame(animate);
}
function stillRender(){ placeCamera(); renderer.render(scene,camera); }
if(STILL){ setTimeout(stillRender,600); setTimeout(stillRender,1700); setTimeout(stillRender,3200); }
else requestAnimationFrame(animate);

function doResize(){ camera.aspect=VW()/VH(); camera.updateProjectionMatrix(); renderer.setSize(VW(),VH()); if(STILL) stillRender(); }
addEventListener('resize', doResize); addEventListener('load', doResize);
setTimeout(doResize,60); setTimeout(doResize,400);
window.__pause=()=>{paused=true;renderer.render(scene,camera);};
window.__resume=()=>{paused=false;last=performance.now();};
