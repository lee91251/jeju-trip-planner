/* ===== 제주 3D — 시네마틱 양식화 지도 (Three.js) ===== */
const CENTER_LNG=126.55, CENTER_LAT=33.38, SCALE=260, THICK=8;
const toX = lng => (lng-CENTER_LNG)*SCALE;
const toZ = lat => -(lat-CENTER_LAT)*SCALE;

const scene = new THREE.Scene();
// 하늘 그라데이션 배경 (수평선 글로우 → 어두운 위)
(function(){
  const cnv=document.createElement('canvas'); cnv.width=4; cnv.height=512;
  const g=cnv.getContext('2d'), grd=g.createLinearGradient(0,0,0,512);
  grd.addColorStop(0,'#020912'); grd.addColorStop(0.55,'#06182a'); grd.addColorStop(0.82,'#0d3550'); grd.addColorStop(1,'#16557a');
  g.fillStyle=grd; g.fillRect(0,0,4,512);
  const tex=new THREE.CanvasTexture(cnv); tex.encoding=THREE.sRGBEncoding;
  scene.background=tex;
})();
scene.fog = new THREE.FogExp2(0x07182a, 0.0017);

const camera = new THREE.PerspectiveCamera(46, innerWidth/innerHeight, 1, 5000);

const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 시네마틱
renderer.toneMappingExposure = 0.92;
renderer.outputEncoding = THREE.sRGBEncoding;
document.getElementById('c').appendChild(renderer.domElement);

/* ---- 조명 (영화 같은 3점 조명, 대비 강조) ---- */
scene.add(new THREE.HemisphereLight(0x8fbfff, 0x0a1620, 0.45));
const key = new THREE.DirectionalLight(0xffdcab, 2.5);   // 따뜻한 석양빛 (측면·낮게 → 긴 그림자)
key.position.set(175, 95, 60);
key.castShadow = true;
key.shadow.mapSize.set(2048,2048);
key.shadow.camera.left=-280; key.shadow.camera.right=280; key.shadow.camera.top=280; key.shadow.camera.bottom=-280;
key.shadow.camera.far=900; key.shadow.bias=-0.0004; key.shadow.radius=4;
scene.add(key);
const rim = new THREE.DirectionalLight(0x46c2ff, 1.7);   // 차가운 림라이트(뒤에서 윤곽 글로우)
rim.position.set(-150, 80, -150); scene.add(rim);
const fill = new THREE.DirectionalLight(0x7df0dc, 0.3);
fill.position.set(-60, 50, 130); scene.add(fill);

/* ---- 바다 (깊고 잔잔, 은은한 반사) ---- */
const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(6000,6000),
  new THREE.MeshStandardMaterial({ color:0x071b30, roughness:0.42, metalness:0.5 })
);
ocean.rotation.x = -Math.PI/2; ocean.position.y = -0.5; ocean.receiveShadow = true;
scene.add(ocean);

/* ---- 제주 섬 (실제 윤곽 + 한라산이 솟는 높이지형) ---- */
const hx=toX(HALLASAN.lng), hz=toZ(HALLASAN.lat);
const poly = JEJU_OUTLINE.map(([lng,lat])=>[toX(lng), toZ(lat)]);
const xsv=poly.map(p=>p[0]), zsv=poly.map(p=>p[1]);
const minX=Math.min(...xsv),maxX=Math.max(...xsv),minZ=Math.min(...zsv),maxZ=Math.max(...zsv);
const padXZ=10, bw=(maxX-minX)+padXZ*2, bd=(maxZ-minZ)+padXZ*2, bcx=(minX+maxX)/2, bcz=(minZ+maxZ)/2;
function inPoly(x,z){ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const xi=poly[i][0],zi=poly[i][1],xj=poly[j][0],zj=poly[j][1]; if(((zi>z)!==(zj>z)) && (x<(xj-xi)*(z-zi)/((zj-zi)||1e-9)+xi)) c=!c; } return c; }
function distToEdge(x,z){ let m=1e9; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const ax=poly[j][0],az=poly[j][1],bx=poly[i][0],bz=poly[i][1]; const dx=bx-ax,dz=bz-az; const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/((dx*dx+dz*dz)||1e-9))); const px=ax+t*dx,pz=az+t*dz; const d=Math.hypot(x-px,z-pz); if(d<m)m=d; } return m; }

const SEG=150;
const islandGeo = new THREE.PlaneGeometry(bw, bd, SEG, SEG);
islandGeo.rotateX(-Math.PI/2);
const pos = islandGeo.attributes.position;
const colors = [];
const cCoast=new THREE.Color(0x53b89a), cLow=new THREE.Color(0x3a9456), cMid=new THREE.Color(0x277a43), cHigh=new THREE.Color(0x5c9a5a), cSnow=new THREE.Color(0xf2f8ff);
const PEAK=40, RANGE=Math.max(maxX-minX,maxZ-minZ)*0.50;
for(let i=0;i<pos.count;i++){
  const x=pos.getX(i)+bcx, z=pos.getZ(i)+bcz;
  pos.setX(i,x); pos.setZ(i,z);
  const inside=inPoly(x,z);
  let y, col=new THREE.Color();
  if(inside){
    const dPeak=Math.hypot(x-hx,z-hz);
    const t=Math.max(0,1-dPeak/RANGE); const dome=t*t*(3-2*t);     // 가운데로 갈수록 솟음
    const edge=Math.min(1, distToEdge(x,z)/22);                    // 해안은 완만하게(절벽 방지)
    const ridge=(Math.sin(x*0.05)*Math.cos(z*0.06)+Math.sin(x*0.11+z*0.04)*0.5)*1.3;
    y = 1.2 + PEAK*dome*edge + ridge*edge + 2.5*edge;
    const hN=Math.min(1, y/(PEAK*0.95));
    if(hN<0.18) col.copy(cCoast).lerp(cLow, hN/0.18);
    else if(hN<0.55) col.copy(cLow).lerp(cMid,(hN-0.18)/0.37);
    else if(hN<0.88) col.copy(cMid).lerp(cHigh,(hN-0.55)/0.33);
    else col.copy(cHigh).lerp(cSnow, Math.min(1,(hN-0.88)/0.12));
  } else { y=-6; col.copy(cCoast).multiplyScalar(0.25); }
  pos.setY(i,y);
  colors.push(col.r,col.g,col.b);
}
islandGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
islandGeo.computeVertexNormals();
const island = new THREE.Mesh(islandGeo, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.95, metalness:0.0 }));
island.castShadow = island.receiveShadow = true;
scene.add(island);

// 해안 라인(시안 글로우 테두리)
const edgePts = JEJU_OUTLINE.map(([lng,lat])=> new THREE.Vector3(toX(lng), 2.2, toZ(lat)));
edgePts.push(edgePts[0].clone());
const edgeLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(edgePts),
  new THREE.LineBasicMaterial({ color:0x7af0e0, transparent:true, opacity:0.7 })
);
scene.add(edgeLine);

/* ---- 카메라 시네마틱 무빙 (살짝 기운 항공 뷰) ---- */
const REST_R=140, REST_H=98;
const camTarget = new THREE.Vector3(0, 7, 0);
let orbit = 0.42, radius = REST_R, height = REST_H;
let autoRotate = true, paused = false;

function placeCamera(){
  camera.position.set(
    camTarget.x + Math.sin(orbit)*radius,
    camTarget.y + height,
    camTarget.z + Math.cos(orbit)*radius
  );
  camera.lookAt(camTarget);
}
placeCamera();

// 인트로: 멀리서 천천히 내려오며 자리잡기 (최종값 REST_R/REST_H로)
gsap.fromTo({r:460, h:430}, {r:460,h:430}, {
  r:REST_R, h:REST_H, duration:3.4, ease:'power2.out',
  onUpdate:function(){ const t=this.targets()[0]; radius=t.r; height=t.h; },
});

let last = performance.now();
function animate(now){
  requestAnimationFrame(animate);
  if(paused) return;
  const dt = Math.min((now-last)/1000, 0.05); last = now;
  if(autoRotate) orbit += dt*0.06;
  edgeLine.material.opacity = 0.45 + Math.sin(now*0.0015)*0.18;
  placeCamera();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 스크린샷용: 일시정지 + 캔버스 데이터
window.__shot = ()=>{ paused=true; renderer.render(scene,camera); return renderer.domElement.toDataURL('image/jpeg',0.7); };
window.__resume = ()=>{ paused=false; last=performance.now(); };
