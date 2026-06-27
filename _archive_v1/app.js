/* ===== 제주 여행 플래너 — 3D 무대 + 스크롤 애니메이션 ===== */
gsap.registerPlugin(ScrollTrigger);

// ---- 좌표 변환 (경도/위도 → 무대 좌표) ----
const CENTER_LNG = 126.55, CENTER_LAT = 33.39, SCALE = 230, THICK = 6;
const toX = lng => (lng - CENTER_LNG) * SCALE;
const toZ = lat => -(lat - CENTER_LAT) * SCALE;

// ---- Three.js 기본 셋업 ----
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06121f);
scene.fog = new THREE.FogExp2(0x06121f, 0.0016);

const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 1, 4000);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

// ---- 조명 ----
scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x14304a, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(120, 220, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-300; sun.shadow.camera.right=300;
sun.shadow.camera.top=300; sun.shadow.camera.bottom=-300;
sun.shadow.camera.far=900;
scene.add(sun);

// ---- 바다 ----
const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(4000,4000,1,1),
  new THREE.MeshStandardMaterial({ color:0x0e3a5f, roughness:0.4, metalness:0.5 })
);
ocean.rotation.x = -Math.PI/2; ocean.position.y = 0; ocean.receiveShadow = true;
scene.add(ocean);

// ---- 제주 섬 (해안선 압출) ----
const shape = new THREE.Shape();
JEJU_OUTLINE.forEach(([lng,lat],i)=>{
  const x = toX(lng), y = (lat - CENTER_LAT) * SCALE; // 셰이프는 (x,y)평면
  i===0 ? shape.moveTo(x,y) : shape.lineTo(x,y);
});
shape.closePath();
const islandGeo = new THREE.ExtrudeGeometry(shape, { depth:THICK, bevelEnabled:true, bevelThickness:1.4, bevelSize:1.4, bevelSegments:2 });
islandGeo.rotateX(-Math.PI/2); // 눕히기 → 북쪽이 -z
const island = new THREE.Mesh(islandGeo, new THREE.MeshStandardMaterial({ color:0x2f7d4f, roughness:0.95, side:THREE.DoubleSide }));
island.castShadow = island.receiveShadow = true;
scene.add(island);

// 해안 띠(밝은 모래색 테두리 느낌)
const edge = new THREE.Mesh(islandGeo.clone(), new THREE.MeshStandardMaterial({ color:0x6fae7a, transparent:true, opacity:0.0 }));
scene.add(edge);

// ---- 한라산 ----
const halla = new THREE.Mesh(
  new THREE.ConeGeometry(26, 30, 48),
  new THREE.MeshStandardMaterial({ color:0x4a8a5e, roughness:1 })
);
halla.position.set(toX(HALLASAN.lng), THICK+13, toZ(HALLASAN.lat));
halla.castShadow = true; scene.add(halla);
const cap = new THREE.Mesh(new THREE.ConeGeometry(8, 9, 48), new THREE.MeshStandardMaterial({color:0xeaf6ff, roughness:0.6}));
cap.position.set(toX(HALLASAN.lng), THICK+25, toZ(HALLASAN.lat)); scene.add(cap);

// ---- 마커 + 라벨 (모든 장소) ----
const labelsEl = document.getElementById('labels');
const markers = {}; // name -> {group, head, label, place}
const headGeo = new THREE.SphereGeometry(2.2, 20, 20);
const stemGeo = new THREE.CylinderGeometry(0.4, 0.4, 9, 8);

PLACES.forEach(p=>{
  const g = new THREE.Group();
  const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color:0x5b7a92, emissive:0x10202c, roughness:0.4 }));
  head.position.y = 9; head.castShadow = true;
  const stem = new THREE.Mesh(stemGeo, new THREE.MeshStandardMaterial({ color:0x5b7a92, roughness:0.6 }));
  stem.position.y = 4.5;
  g.add(stem); g.add(head);
  g.position.set(toX(p.lng), THICK, toZ(p.lat));
  g.scale.setScalar(0.55);
  scene.add(g);

  const label = document.createElement('div');
  label.className = 'lbl';
  label.textContent = (ICONS[p.cat]||'📍') + ' ' + p.name;
  labelsEl.appendChild(label);

  markers[p.name] = { group:g, head, stem, label, place:p, route:false };
});

// ---- 이동 경로(곡선) ----
const DAY_COLORS = [0x2dd4bf, 0xfbbf24, 0xf472b6, 0x60a5fa, 0xa78bfa];
const routeGroup = new THREE.Group(); scene.add(routeGroup);
function clearRoutes(){ while(routeGroup.children.length){ const c=routeGroup.children.pop(); c.geometry?.dispose(); routeGroup.remove(c); } }
function buildRoutes(days){
  clearRoutes();
  days.forEach((d,di)=>{
    if(d.places.length<2) return;
    const pts=[];
    for(let i=0;i<d.places.length-1;i++){
      const a=d.places[i], b=d.places[i+1];
      const ax=toX(a.lng), az=toZ(a.lat), bx=toX(b.lng), bz=toZ(b.lat);
      const dist=Math.hypot(bx-ax, bz-az);
      const mid=new THREE.Vector3((ax+bx)/2, THICK+8+dist*0.28, (az+bz)/2);
      const curve=new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(ax,THICK+9,az), mid, new THREE.Vector3(bx,THICK+9,bz));
      curve.getPoints(26).forEach(p=>pts.push(p));
    }
    const geo=new THREE.BufferGeometry().setFromPoints(pts);
    const line=new THREE.Line(geo, new THREE.LineBasicMaterial({ color:DAY_COLORS[di%DAY_COLORS.length], transparent:true, opacity:0.9 }));
    geo.setDrawRange(0,0);
    routeGroup.add(line);
    gsap.to({n:0},{ n:pts.length, duration:1.1, delay:0.15+di*0.1, ease:'power1.inOut',
      onUpdate:function(){ geo.setDrawRange(0, Math.floor(this.targets()[0].n)); } });
  });
}

function setRoute(name, on, order){
  const m = markers[name]; if(!m) return;
  m.route = on;
  const c = on ? 0xfbbf24 : 0x5b7a92;
  m.head.material.color.setHex(c); m.head.material.emissive.setHex(on?0x6b4f00:0x10202c);
  m.stem.material.color.setHex(c);
  gsap.to(m.group.scale, { x:on?1:0.55, y:on?1:0.55, z:on?1:0.55, duration:0.6, ease:'back.out(2)' });
  m.label.classList.toggle('route', on);
  m.order = order;
}
function highlightDay(names){
  Object.values(markers).forEach(m=> m.label.classList.toggle('on', m.route));
  // 활성 일자 핀만 teal 강조
  Object.entries(markers).forEach(([n,m])=>{
    if(!m.route) return;
    const active = names.includes(n);
    m.head.material.color.setHex(active?0x2dd4bf:0xfbbf24);
    m.stem.material.color.setHex(active?0x2dd4bf:0xfbbf24);
  });
}

// ---- 카메라 컨트롤 (부드러운 추적 + 궤도 회전) ----
const camTarget = new THREE.Vector3(0, THICK, 0);
const camPos = new THREE.Vector3();
let desiredTarget = new THREE.Vector3(0, THICK, 0);
let orbitAngle = 0.6, desiredAngle = 0.6, radius = 200, desiredRadius = 200, height = 170, desiredHeight = 170;
let drift = 0;

function setView(focus, ang, r, h){
  desiredTarget.copy(focus); desiredAngle = ang; desiredRadius = r; desiredHeight = h;
}
function overview(){ setView(new THREE.Vector3(0,THICK,0), 0.6 + drift, 230, 190); }
overview();

// ---- 라벨 화면 투영 ----
const _v = new THREE.Vector3();
function updateLabels(){
  for(const name in markers){
    const m = markers[name];
    if(!m.label.classList.contains('on')){ m.label.style.opacity=0; continue; }
    _v.set(m.group.position.x, m.group.position.y + 12*m.group.scale.x, m.group.position.z);
    _v.project(camera);
    const visible = _v.z < 1;
    if(!visible){ m.label.style.display='none'; continue; }
    m.label.style.display='block';
    m.label.style.left = (( _v.x*0.5+0.5)*innerWidth) + 'px';
    m.label.style.top  = ((-_v.y*0.5+0.5)*innerHeight) + 'px';
  }
}

// ---- 렌더 루프 ----
let last = performance.now();
let paused = false;
document.addEventListener('visibilitychange', ()=>{ paused = document.hidden; last = performance.now(); });
function animate(now){
  requestAnimationFrame(animate);
  if(paused){ return; }
  const dt = Math.min((now-last)/1000, 0.05); last = now;
  drift += dt * 0.06;                       // 지도 천천히 돌아가는 효과
  desiredAngle += dt * 0.06;
  orbitAngle += (desiredAngle - orbitAngle) * Math.min(dt*3,1);
  radius += (desiredRadius - radius) * Math.min(dt*2.2,1);
  height += (desiredHeight - height) * Math.min(dt*2.2,1);
  camTarget.lerp(desiredTarget, Math.min(dt*2.2,1));

  camPos.set(
    camTarget.x + Math.sin(orbitAngle)*radius,
    camTarget.y + height,
    camTarget.z + Math.cos(orbitAngle)*radius
  );
  camera.position.copy(camPos);
  camera.lookAt(camTarget);

  // 루트 핀 살짝 떠다니기
  for(const n in markers){ const m=markers[n]; if(m.route) m.group.position.y = THICK + Math.sin(drift*2 + m.group.position.x)*1.2; }

  updateLabels();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ===================== UI / 일정 로직 ===================== */
const selected = []; // 선택된 장소명
const $ = s => document.querySelector(s);

// datalist + 추천칩 채우기
const dl = $('#places');
PLACES.forEach(p=>{ const o=document.createElement('option'); o.value=p.name; dl.appendChild(o); });
const QUICK = ["성산일출봉","협재해수욕장","오설록 티뮤지엄","천지연폭포","우도","한라산 성판악"];
const quickEl = $('#quick');
QUICK.forEach(n=>{ const s=document.createElement('span'); s.textContent='+ '+n; s.onclick=()=>addPlace(n); quickEl.appendChild(s); });

function findPlace(q){
  q=q.trim(); if(!q) return null;
  return PLACES.find(p=>p.name===q) || PLACES.find(p=>p.name.includes(q));
}
function addPlace(name){
  const p = findPlace(name); if(!p){ flashSearch(); return; }
  if(selected.includes(p.name)) return;
  selected.push(p.name); renderChips(); $('#search').value='';
}
function removePlace(name){ const i=selected.indexOf(name); if(i>=0){ selected.splice(i,1); renderChips(); } }
function renderChips(){
  const el = $('#chips');
  if(!selected.length){ el.innerHTML='<div class="empty">아직 추가된 장소가 없어요.</div>'; return; }
  el.innerHTML='';
  selected.forEach(n=>{
    const c=document.createElement('div'); c.className='chip';
    c.innerHTML = `<span>${n}</span><b title="삭제">✕</b>`;
    c.querySelector('b').onclick=()=>removePlace(n);
    el.appendChild(c);
  });
}
function flashSearch(){ const s=$('#search'); s.style.borderColor='#f87171'; setTimeout(()=>s.style.borderColor='',600); }

$('#add').onclick = ()=> addPlace($('#search').value);
$('#search').addEventListener('keydown', e=>{ if(e.key==='Enter') addPlace($('#search').value); });
$('#reset').onclick = ()=> resetAll();
$('#toggle').onclick = ()=> $('#panel').classList.toggle('min');

// 최근접 이웃 동선 정렬
function orderRoute(names){
  const pts = names.map(n=>PLACES.find(p=>p.name===n));
  const startIdx = Math.max(0, pts.findIndex(p=>p.name==='제주공항'));
  const route=[]; const used=new Array(pts.length).fill(false);
  let cur = startIdx; route.push(pts[cur]); used[cur]=true;
  for(let k=1;k<pts.length;k++){
    let best=-1, bd=Infinity;
    for(let j=0;j<pts.length;j++){ if(used[j])continue;
      const d=(pts[j].lng-pts[cur].lng)**2+(pts[j].lat-pts[cur].lat)**2;
      if(d<bd){bd=d;best=j;}
    }
    route.push(pts[best]); used[best]=true; cur=best;
  }
  return route;
}
function commonRegion(arr){
  const c={}; arr.forEach(p=>c[p.region]=(c[p.region]||0)+1);
  return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];
}

let triggers = [];
function clearTriggers(){ triggers.forEach(t=>t.kill()); triggers=[]; }
let DAYS = [];

function generate(){
  if(selected.length<1){ flashSearch(); return; }
  const D = parseInt($('#days').value,10);
  const route = orderRoute(selected);
  // 균등 분할
  const per = Math.ceil(route.length / D);
  DAYS = [];
  for(let i=0;i<D;i++){
    const chunk = route.slice(i*per, (i+1)*per);
    if(!chunk.length) continue;
    const cx = chunk.reduce((s,p)=>s+toX(p.lng),0)/chunk.length;
    const cz = chunk.reduce((s,p)=>s+toZ(p.lat),0)/chunk.length;
    DAYS.push({ idx:DAYS.length+1, places:chunk, region:commonRegion(chunk), focus:new THREE.Vector3(cx,THICK,cz) });
  }

  // 마커 + 경로 갱신
  Object.keys(markers).forEach(n=>setRoute(n,false));
  let order=1;
  DAYS.forEach(d=> d.places.forEach(p=> setRoute(p.name,true,order++)));
  buildRoutes(DAYS);

  // 일자 카드 렌더
  const it = $('#itinerary'); it.innerHTML='';
  DAYS.forEach((d,di)=>{
    const sec=document.createElement('section'); sec.className='section';
    const stay = d.places.reduce((s,p)=>s+(p.dur||0),0);
    const items = d.places.map((p,i)=>`<li>
      <div class="n">${i+1}</div>
      <div class="info"><div class="nm">${ICONS[p.cat]||'📍'} ${p.name} <span class="dur">${p.dur?fmtMin(p.dur):''}</span></div>
      <div class="desc">${p.desc||''}</div></div></li>`).join('');
    const dot = DAY_COLORS[di%DAY_COLORS.length].toString(16).padStart(6,'0');
    sec.innerHTML = `<div class="day"><span class="badge" style="background:linear-gradient(90deg,#${dot},#0ea5b7)">DAY ${d.idx}</span>
      <h2>${d.region} 코스</h2>
      <div class="region">${d.places.length}곳 · 체류 약 ${fmtMin(stay)} · 추천 동선순</div>
      <ul>${items}</ul></div>`;
    it.appendChild(sec);
    const card = sec.querySelector('.day');
    triggers.push(ScrollTrigger.create({
      trigger:sec, start:'top 60%', end:'bottom 40%',
      onToggle:self=>{ if(self.isActive) focusDay(d, card); },
      onEnter:()=>focusDay(d,card), onEnterBack:()=>focusDay(d,card)
    }));
  });
  $('#end').style.display='flex';
  savePlan();

  ScrollTrigger.refresh();
  // 첫 일자로 스크롤
  setTimeout(()=> document.querySelector('#itinerary .section')?.scrollIntoView({behavior:'smooth'}), 250);
}

function fmtMin(m){ if(!m) return '0분'; const h=Math.floor(m/60), mm=m%60; return (h?h+'시간':'')+(mm?(h?' ':'')+mm+'분':(h?'':'0분')); }

function focusDay(d, card){
  document.querySelectorAll('.day').forEach(c=>c.classList.remove('in'));
  card.classList.add('in');
  const ang = 0.6 + d.idx * 0.85 + drift;
  setView(d.focus.clone(), ang, 95, 78);
  highlightDay(d.places.map(p=>p.name));
}

// 히어로 영역 → 전체 보기
ScrollTrigger.create({ trigger:'.hero', start:'top 40%', end:'bottom 30%',
  onEnter:overview, onEnterBack:overview });

function resetAll(){
  selected.length=0; renderChips(); clearTriggers(); clearRoutes();
  $('#itinerary').innerHTML=''; $('#end').style.display='none';
  Object.keys(markers).forEach(n=>{ setRoute(n,false); markers[n].label.classList.remove('on'); });
  DAYS=[]; overview(); ScrollTrigger.refresh();
  try{ localStorage.removeItem('jeju_plan'); }catch(e){}
  scrollTo({top:0,behavior:'smooth'});
}

$('#gen').onclick = generate;

/* ===== 저장 · 공유 · 인쇄 ===== */
function planData(){ return { v:1, days:parseInt($('#days').value,10), places:selected.slice() }; }
function savePlan(){ try{ localStorage.setItem('jeju_plan', JSON.stringify(planData())); }catch(e){} }
function applyPlan(p){
  if(!p||!p.places) return false;
  selected.length=0; p.places.forEach(n=>{ if(PLACES.find(x=>x.name===n)) selected.push(n); });
  if(p.days) $('#days').value=p.days;
  renderChips();
  return selected.length>0;
}
// base64(URL-safe) 인코딩으로 공유 링크
function encodePlan(p){ return btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function decodePlan(s){ try{ s=s.replace(/-/g,'+').replace(/_/g,'/'); return JSON.parse(decodeURIComponent(escape(atob(s)))); }catch(e){ return null; } }

function sharePlan(){
  if(!selected.length){ flashSearch(); return; }
  const url = location.origin+location.pathname+'?p='+encodePlan(planData());
  const done = ()=> toast('공유 링크가 복사됐어요! 붙여넣기로 전달하세요.');
  if(navigator.clipboard){ navigator.clipboard.writeText(url).then(done, ()=>prompt('아래 링크를 복사하세요:',url)); }
  else prompt('아래 링크를 복사하세요:', url);
}
function printPlan(){ if(!DAYS.length){ toast('먼저 일정을 생성하세요.'); return; } window.print(); }

function toast(msg){
  let t=document.getElementById('toast');
  if(!t){ t=document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.className='show';
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.className='',2600);
}

$('#save')?.addEventListener('click', ()=>{ savePlan(); toast('이 기기에 저장했어요. 다음에 열면 자동으로 불러옵니다.'); });
$('#share')?.addEventListener('click', sharePlan);
$('#print')?.addEventListener('click', printPlan);

// 시작 시: URL 공유링크 > 저장된 일정 순으로 복원
(function restore(){
  const q=new URLSearchParams(location.search).get('p');
  let p = q ? decodePlan(q) : null;
  if(!p){ try{ p=JSON.parse(localStorage.getItem('jeju_plan')||'null'); }catch(e){} }
  if(applyPlan(p)){
    // 공유링크로 들어오면 자동 생성, 저장본은 칩만 복원
    if(q) setTimeout(generate, 400);
  }
})();

// 진행 바
addEventListener('scroll', ()=>{
  const h=document.documentElement; const p=h.scrollTop/(h.scrollHeight-h.clientHeight||1);
  $('#progress').style.width=(p*100)+'%';
});
