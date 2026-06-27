/* ===== 여행 플래너 v2 — MapLibre 실제 3D 지도 + 스크롤 비행 ===== */
gsap.registerPlugin(ScrollTrigger);
const $ = s => document.querySelector(s);

// ---- 현재 지역 설정 (나중에 다른 지역으로 교체 가능) ----
const REGION = {
  name:'제주',
  center:[126.55, 33.38], zoom:9.4, minZoom:8.6,
  maxBounds:[[125.9, 32.95],[127.35, 33.78]],   // 이 범위 밖으로 못 나감
  viewbox:'126.0,33.74,127.2,32.98'             // 검색 우선 영역
};

// ---- 지도 초기화 (토큰 불필요) ----
// 장막 뒤에서 제주 상공에 세팅 → 장막 걷히며 기울며 줌인 → 제주로 잠금
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: REGION.center, zoom: 8.6, pitch: 0, bearing: 6,
  attributionControl: { compact: true }
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch:true }), 'bottom-right');
map.scrollZoom.disable();    // 휠은 페이지 스크롤용 (지도 줌 아님)
map.doubleClickZoom.disable();

let mapReady = false;
function initMap(){
  if(mapReady) return;          // 중복 방지 (load + 폴링 둘 다 호출될 수 있음)
  mapReady = true;
  // 실제 3D 지형 (무료 AWS terrarium DEM)
  try{
    map.addSource('dem', {
      type:'raster-dem',
      tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding:'terrarium', tileSize:256, maxzoom:14
    });
    map.setTerrain({ source:'dem', exaggeration:1.4 });
  }catch(e){}
  // 하늘
  try{ map.setSky({ 'sky-color':'#0b2138', 'horizon-color':'#1a4d7a', 'fog-color':'#0e3a5f', 'fog-ground-blend':0.4, 'sky-horizon-blend':0.6 }); }catch(e){}
  // 경로 라인 소스/레이어
  if(!map.getSource('routes')){
    map.addSource('routes', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
    map.addLayer({ id:'routes-line', type:'line', source:'routes',
      layout:{ 'line-cap':'round', 'line-join':'round' },
      paint:{ 'line-color':['get','color'], 'line-width':4, 'line-opacity':0.9, 'line-dasharray':[1.5,1.2] } });
  }
  if(pendingRestore){ pendingRestore(); pendingRestore=null; }
  startIntro();
}
map.on('load', initMap);

// ===== 시네마틱 인트로 (지구본 → 제주로 날아오는 오프닝) =====
let introDone=false;
function lockToJeju(){ try{ map.setMaxBounds(REGION.maxBounds); map.setMinZoom(REGION.minZoom); }catch(e){} }
function startIntro(){
  if(introDone) return; introDone=true;
  document.body.classList.add('intro-active');   // 인트로 동안 뒤(.hero) 글자 숨김 → 겹침 방지
  const el=document.getElementById('intro');
  const hideNow=()=>{ document.body.classList.remove('intro-active'); if(el){ el.classList.add('hide'); setTimeout(()=>el&&(el.style.display='none'),1200);} };
  // 저장된 일정이 있으면 인트로 생략 → 바로 제주
  if(selected.length){ try{ map.jumpTo({ center:REGION.center, zoom:REGION.zoom, pitch:55, bearing:-12 }); }catch(e){} lockToJeju(); hideNow(); return; }
  // 지구본(우주)에서 제주로 부드럽게 날아옴
  // 장막 뒤: 제주 상공을 평평하게 세팅 (깜빡임 없음)
  try{ map.jumpTo({ center:REGION.center, zoom:8.7, pitch:0, bearing:8 }); }catch(e){}
  const hide=()=>{ document.body.classList.remove('intro-active'); if(el){ el.classList.add('hide'); setTimeout(()=>el&&(el.style.display='none'),1300);}
    removeEventListener('wheel',hide); removeEventListener('touchmove',hide); };
  // 1.2초: 타이틀 감상 → 장막이 걷히며 제주 지형이 기울며 줌인(웅장하게 일어섬)
  setTimeout(()=>{
    if(el) el.classList.add('reveal');
    try{ map.easeTo({ center:REGION.center, zoom:9.7, pitch:60, bearing:-14, duration:5200, easing:t=>1-Math.pow(1-t,3), essential:true }); }catch(e){}
  }, 1200);
  setTimeout(lockToJeju, 6800);
  if(!el) return;
  el.addEventListener('click',hide);
  addEventListener('wheel',hide,{passive:true}); addEventListener('touchmove',hide,{passive:true});
  setTimeout(hide, 5800);   // 줌인 마무리 즈음 장막 사라짐
}
// 안전장치: load 이벤트가 안 떠도 스타일이 준비되면 진행
(function poll(){ if(mapReady) return; if(map.isStyleLoaded()) initMap(); else setTimeout(poll, 400); })();

const DAY_COLORS = ['#2dd4bf','#fbbf24','#f472b6','#60a5fa','#a78bfa','#f97316','#34d399'];

// ---- 상태 ----
let selected = [];   // {name, lng, lat, cat?, dur?, desc?, img?, day}
let DAYS = [], triggers = [], markerObjs = [];
let totalDays = 2;   // 총 여행일
let activeDay = 1;   // 지금 추가할 일차

// ---- 일차 탭 ----
function renderDayTabs(){
  const el=$('#daytabs'); if(!el) return; el.innerHTML='';
  for(let d=1; d<=totalDays; d++){
    const cnt=selected.filter(p=>p.day===d).length;
    const b=document.createElement('div');
    b.className='daytab'+(d===activeDay?' on':'');
    if(d===activeDay) b.style.background=DAY_COLORS[(d-1)%DAY_COLORS.length];
    b.innerHTML=`${d}일차<span class="cnt">${cnt}곳</span>`;
    b.onclick=()=>{ activeDay=d; renderDayTabs(); renderChips(); if(DAYS.length){ const day=DAYS.find(x=>x.idx===d); if(day) jumpToDay(day); } };
    el.appendChild(b);
  }
}
function jumpToDay(day){
  const sec=document.querySelector(`#itinerary [data-day="${day.idx}"]`);
  if(sec) sec.scrollIntoView({behavior:'smooth'});
}

// ---- 프리셋(제주) 빠른 추가 + 검색 사전 ----
const PRESET = (typeof PLACES!=='undefined') ? PLACES : [];
// 추천 49곳: 관광공사 키워드검색으로 검증한 정확한 사진을 미리 부착(최우선)
if(typeof PRESET_IMG!=='undefined') PRESET.forEach(p=>{ if(PRESET_IMG[p.name]) p.img=PRESET_IMG[p.name]; });
const presetByName = {}; PRESET.forEach(p=>presetByName[p.name]=p);
// 로컬 검색 사전(프리셋 + 관광공사 TourAPI 데이터 병합)
let localByName = Object.assign({}, presetByName);
let TOUR = [];
// places_jeju.json (관광공사 데이터)이 있으면 불러와 병합 — 없으면 조용히 건너뜀
fetch('places_jeju.json').then(r=>r.ok?r.json():null).then(arr=>{
  if(!Array.isArray(arr)||!arr.length) return;
  TOUR=arr;
  arr.forEach(p=>{ if(!localByName[p.name]) localByName[p.name]=p; });
  // 프리셋(큐레이션 49곳)에 관광공사 사진을 '이름이 같은' 곳에서 가져와 보강
  PRESET.forEach(pr=>{ if(!pr.img){ const im=photoForName(pr.name, pr.lng, pr.lat); if(im) pr.img=im; } });
  buildAutocompleteIndex();
  // 이미 추가/복원된 장소도 데이터 도착 후 사진 재매칭 + 화면 갱신 (타이밍 race 방지)
  if(selected.length){ selected.forEach(enrichPhoto); if(DAYS.length) generate(false); else previewMarkers(); }
  toast(`제주 관광지 ${arr.length.toLocaleString()}곳 + 사진을 불러왔어요`);
}).catch(()=>{});

const QUICK = ["성산일출봉","협재해수욕장","오설록 티뮤지엄","천지연폭포","우도","만장굴"];
const quickEl = $('#quick');
QUICK.forEach(n=>{ const s=document.createElement('span'); s.textContent='+ '+n; s.onclick=()=>addByName(n); quickEl.appendChild(s); });

// ---- AI 추천 코스 (프리셋 조합 템플릿) ----
const COURSES = [
  { title:'제주 인기 베스트', days:3, sub:'동·서 핵심 한 바퀴',
    places:['성산일출봉','우도','만장굴','한라산 성판악','오설록 티뮤지엄','협재해수욕장','천지연폭포','중문관광단지'] },
  { title:'동부 자연·바다', days:2, sub:'성산·우도·숲',
    places:['성산일출봉','우도','섭지코지','비자림','월정리해변','함덕해수욕장'] },
  { title:'서부+남부 감성', days:3, sub:'카페·해변·폭포',
    places:['협재해수욕장','오설록 티뮤지엄','카멜리아힐','산방산','용머리해안','중문관광단지','천지연폭포','외돌개'] },
  { title:'힐링·숲 코스', days:2, sub:'느긋한 산책 위주',
    places:['사려니숲길','비자림','절물자연휴양림','쇠소깍','천제연폭포','카멜리아힐'] }
];
const recoEl = $('#reco');
COURSES.forEach(c=>{
  const b=document.createElement('button'); b.className='reco-card';
  b.innerHTML=`<div class="t">${c.title} <span style="color:#fbbf24">· ${c.days}일</span></div><div class="d">${c.sub} · ${c.places.length}곳</div>`;
  b.onclick=()=>applyCourse(c);
  recoEl.appendChild(b);
});
function applyCourse(c){
  selected = c.places.filter(n=>localByName[n]).map(n=>({...localByName[n]}));
  totalDays=c.days; $('#days').value=c.days; activeDay=1;
  // 코스 장소를 가까운 곳끼리 일차 자동 배치
  const groups=splitDays(selected, totalDays);
  groups.forEach((g,i)=> g.forEach(p=>{ p.day=i+1; }));
  renderDayTabs(); renderChips();
  if(mapReady){ generate(true); } else { pendingRestore=()=>generate(true); }
  toast(`'${c.title}' 코스를 불러왔어요. 칩 숫자로 일차를 바꿀 수 있어요!`);
}

// ---- 장소 추가 (로컬 DB 우선, 없으면 지오코딩으로 무엇이든) ----
async function addByName(q){
  q = (q||'').trim(); if(!q) return;
  if(selected.some(p=>p.name===q)){ toast('이미 추가된 장소예요.'); return; }
  // 1) 로컬 DB(프리셋+관광공사) 정확 일치 → 사진 포함, 즉시
  if(localByName[q]){ pushPlace({...localByName[q]}); return; }
  // 2) 로컬 DB 부분 일치
  const hit = Object.keys(localByName).find(n=>n.includes(q));
  if(hit){ pushPlace({...localByName[hit]}); return; }
  // 3) 지오코딩 (전 세계 아무 장소나)
  $('#add').disabled = true; $('#add').textContent='검색…';
  try{
    const r = await geocode(q);
    if(!r){ toast('"'+q+'" 위치를 못 찾았어요. 더 구체적으로 입력해 보세요.'); flashSearch(); return; }
    pushPlace(r);
    toast('추가됨: '+r.name);
  }catch(e){ toast('검색 중 오류가 났어요. 잠시 후 다시 시도하세요.'); }
  finally{ $('#add').disabled=false; $('#add').textContent='추가'; }
}
function pushPlace(p){ p.day=activeDay; selected.push(p); renderChips(); renderDayTabs(); $('#search').value=''; hideAC(); if(DAYS.length) generate(false); else previewMarkers(); showNearbyFor(p); }

/* ===== 주변 발견 (위치 기반 추천) ===== */
function haversineKm(aLng,aLat,bLng,bLat){
  const R=6371, toR=Math.PI/180;
  const dLat=(bLat-aLat)*toR, dLng=(bLng-aLng)*toR;
  const s=Math.sin(dLat/2)**2 + Math.cos(aLat*toR)*Math.cos(bLat*toR)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}
// 좌표 반경 내, 사진 있는 장소 추천 (이미 담은 곳 제외, 가까운 순)
function nearbyPlaces(lng, lat, radiusKm, limit){
  const pool = (typeof TOUR!=='undefined' && TOUR.length) ? TOUR : PRESET;
  const seen = new Set(selected.map(p=>p.name));
  const res=[];
  for(const p of pool){
    if(!p.img || seen.has(p.name)) continue;
    const d=haversineKm(lng,lat,p.lng,p.lat);
    if(d<=radiusKm) res.push(Object.assign({_dist:d}, p));
  }
  res.sort((a,b)=>a._dist-b._dist);
  return res.slice(0, limit||12);
}
function fmtDist(km){ return km<1 ? Math.round(km*1000)+'m' : km.toFixed(1)+'km'; }
function renderNearby(list, title){
  const box=$('#nearby'); if(!box) return;
  if(!list || !list.length){ box.classList.remove('show'); box.innerHTML=''; return; }
  box.innerHTML = `<div class="nearby-h">📍 ${title} 주변 <small>탭해서 추가</small></div>
    <div class="nearby-row">${list.map((p,i)=>`<div class="ncard" data-i="${i}">
      ${p.img?`<img src="${p.img}" loading="lazy" onerror="this.parentNode.classList.add('noimg')">`:''}
      <div class="ncard-b"><div class="ncard-nm">${(typeof ICONS!=='undefined'&&ICONS[p.cat])||'📍'} ${p.name}</div>
      <div class="ncard-meta">${[p.cat, fmtDist(p._dist)].filter(Boolean).join(' · ')}</div></div>
    </div>`).join('')}</div>`;
  box.classList.add('show');
  box.querySelectorAll('.ncard').forEach(el=>{ el.onclick=()=>addNearby(list[+el.dataset.i]); });
}
function addNearby(p){ const o=Object.assign({},p); delete o._dist; pushPlace(o); }
function showNearbyFor(p){ if(!p) return; renderNearby(nearbyPlaces(p.lng,p.lat,3,12), p.name); }

// 내 위치(GPS)로 주변 발견
let myLocMarker=null;
function findNearMe(){
  if(!navigator.geolocation){ toast('이 기기는 위치를 지원하지 않아요.'); return; }
  toast('내 위치를 찾는 중…');
  navigator.geolocation.getCurrentPosition(pos=>{
    const lng=pos.coords.longitude, lat=pos.coords.latitude;
    // 제주 밖이면 제주 중심 기준으로 안내
    const inJeju = lng>125.9&&lng<127.4&&lat>32.9&&lat<33.8;
    if(myLocMarker) myLocMarker.remove();
    const el=document.createElement('div'); el.className='myloc';
    myLocMarker=new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(map);
    if(inJeju){
      try{ map.flyTo({ center:[lng,lat], zoom:14, pitch:55, duration:1600, essential:true }); }catch(e){}
      renderNearby(nearbyPlaces(lng,lat,3,12), '내 위치');
      toast('내 주변 추천을 찾았어요!');
    } else {
      toast('지금은 제주 밖이네요. 제주 장소를 검색하거나 추가해 보세요.');
    }
  }, err=>{
    toast('위치 권한을 허용해 주세요 (브라우저 주소창의 위치 아이콘).');
  }, { enableHighAccuracy:true, timeout:9000, maximumAge:60000 });
}

/* ===== 검색 자동완성 ===== */
let AC_INDEX = [];   // {name, norm, place}
const norm = s => (s||'').toLowerCase().replace(/\s+/g,'');
function buildAutocompleteIndex(){
  AC_INDEX = Object.keys(localByName).map(name=>({ name, norm:norm(name), place:localByName[name] }));
}
buildAutocompleteIndex();   // 초기엔 프리셋 49곳, TourAPI 로드 후 다시 빌드

const acEl = $('#ac');
let acMatches = [], acSel = -1, acLocal=[], acOnline=[], acToken=0, acDebounce=null;
function searchLocal(q){
  const nq = norm(q); if(!nq) return [];
  const starts=[], incl=[];
  for(const it of AC_INDEX){
    if(it.norm===nq || it.norm.startsWith(nq)) starts.push(it);
    else if(it.norm.includes(nq)) incl.push(it);
    if(starts.length>=6) break;
  }
  return starts.concat(incl).slice(0,6);
}
// 실시간 다중 결과 — 카카오(있으면)→OSM. 관광공사에 없는 식당·카페 보충
async function geocodeMany(q){ return await searchOnline(q, 6); }
function renderAC(q){
  q=(q||'').trim();
  if(!q){ hideAC(); return; }
  acLocal = searchLocal(q).map(m=>({kind:'local', name:m.name, place:m.place}));
  acOnline=[]; acSel=-1; acMatches=acLocal.slice(); paintAC();
  // 온라인(지도) 검색 디바운스 — 입력이 바뀌면 취소
  clearTimeout(acDebounce);
  const tk=++acToken;
  if(q.length<2) return;
  acDebounce=setTimeout(async ()=>{
    const res=await geocodeMany(q);
    if(tk!==acToken) return;
    const localNorms=new Set(acLocal.map(m=>norm(m.name)));
    acOnline=res.filter(r=>r.name && !localNorms.has(norm(r.name))).slice(0,5).map(r=>({kind:'online', name:r.name, place:r}));
    acMatches=acLocal.concat(acOnline); paintAC();
  }, 450);
}
function paintAC(){
  if(!acMatches.length){
    acEl.innerHTML=`<div class="ac-empty">🔎 지도에서 찾는 중… 없으면 <b>추가</b>를 누르세요</div>`;
    acEl.classList.add('show'); return;
  }
  let html='', lastKind=null;
  acMatches.forEach((m,i)=>{
    if(m.kind==='online' && lastKind!=='online') html+=`<div class="ac-sec">🌐 지도 검색</div>`;
    lastKind=m.kind;
    const p=m.place, ic=(typeof ICONS!=='undefined'&&ICONS[p.cat])||'📍';
    const sub = m.kind==='online' ? (p.desc?p.desc.split(',').slice(1,3).join(',').trim():'지도') : (p.region||p.cat||'');
    html+=`<div class="ac-item${i===acSel?' sel':''}" data-i="${i}"><span class="ic">${ic}</span><span class="nm">${m.name}</span><span class="rg">${sub}</span></div>`;
  });
  acEl.innerHTML=html; acEl.classList.add('show');
  acEl.querySelectorAll('.ac-item').forEach(el=>{ el.onclick=()=>chooseAC(+el.dataset.i); });
}
function chooseAC(i){
  const m=acMatches[i]; if(!m) return;
  if(m.kind==='local') addByName(m.name);
  else { if(selected.some(x=>x.name===m.place.name)){ toast('이미 추가된 장소예요.'); hideAC(); return; }
    const p=m.place; pushPlace({ name:p.name, lng:p.lng, lat:p.lat, desc:p.desc, tel:p.tel||'', cat:p.cat }); toast('추가됨: '+p.name); }
}
function hideAC(){ acEl.classList.remove('show'); acEl.innerHTML=''; acMatches=[]; acLocal=[]; acOnline=[]; acSel=-1; }
function moveAC(d){
  if(!acMatches.length) return;
  acSel=(acSel+d+acMatches.length)%acMatches.length;
  acEl.querySelectorAll('.ac-item').forEach((el,i)=>el.classList.toggle('sel', i===acSel));
}

/* ===== 장소 검색: 카카오(있으면) → OpenStreetMap 폴백 =====
   KAKAO_KEY를 채우면 카카오가 우선(한국 식당·카페 최강). 비어 있으면 OSM만 사용. */
const KAKAO_KEY = '';   // ← 카카오 JavaScript 키 (받으면 여기 채움)
let kakaoReady=false, kakaoPlaces=null;
(function loadKakao(){
  if(!KAKAO_KEY) return;
  const s=document.createElement('script');
  s.src=`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&libraries=services&autoload=false`;
  s.onload=()=>{ try{ kakao.maps.load(()=>{ kakaoPlaces=new kakao.maps.services.Places(); kakaoReady=true; }); }catch(e){} };
  s.onerror=()=>console.warn('Kakao SDK 로드 실패 — OSM으로 동작');
  document.head.appendChild(s);
})();

function kakaoSearch(q, limit){
  return new Promise(res=>{
    if(!kakaoReady||!kakaoPlaces){ res(null); return; }
    kakaoPlaces.keywordSearch(q, (data,status)=>{
      if(status===kakao.maps.services.Status.OK && data && data.length){
        res(data.slice(0,limit||8).map(d=>({
          name:d.place_name, lng:parseFloat(d.x), lat:parseFloat(d.y),
          desc:d.road_address_name||d.address_name||'', tel:d.phone||'', cat:'장소'
        })));
      } else res([]);
    }, { x:126.55, y:33.38, radius:40000, size:Math.min(limit||8,15) });  // 제주 중심 40km 우선
  });
}
async function osmSearchMany(q, limit){
  async function call(extra){
    const url='https://nominatim.openstreetmap.org/search?format=json&limit='+(limit||6)+'&accept-language=ko&countrycodes=kr'+extra+'&q='+encodeURIComponent(q);
    try{ const r=await fetch(url,{headers:{'Accept':'application/json'}}); return await r.json(); }catch(e){ return null; }
  }
  let a=await call('&viewbox='+REGION.viewbox+'&bounded=1');
  if(!a||!a.length) a=await call('&viewbox='+REGION.viewbox);
  if(!a||!a.length) a=await call('');
  return (a||[]).map(it=>({ name:(it.display_name||q).split(',')[0].trim(), lng:parseFloat(it.lon), lat:parseFloat(it.lat), desc:it.display_name }));
}
async function searchOnline(q, limit){
  if(kakaoReady){ const k=await kakaoSearch(q, limit); if(k && k.length) return k; }
  return await osmSearchMany(q, limit);
}
async function geocode(q){ const a=await searchOnline(q,1); return (a && a[0]) || null; }

// 좌표 → 제주 권역(가장 가까운 프리셋 기준)
function regionOf(p){
  if(p.region) return p.region;
  let best=null,bd=Infinity;
  PRESET.forEach(q=>{ const d=(q.lng-p.lng)**2+(q.lat-p.lat)**2; if(d<bd){bd=d;best=q;} });
  return best?best.region:'';
}
function commonRegion(arr){
  const c={}; arr.forEach(p=>{ const r=regionOf(p); if(r) c[r]=(c[r]||0)+1; });
  const e=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];
  return e?e[0]:'추천';
}

function removePlace(name){
  const i=selected.findIndex(p=>p.name===name);
  if(i<0) return;
  selected.splice(i,1); renderChips(); renderDayTabs();
  if(DAYS.length && selected.length) generate(false);
  else { DAYS=[]; triggers.forEach(t=>t.kill()); triggers=[]; $('#itinerary').innerHTML=''; $('#end').style.display='none'; previewMarkers(); }
}
function moveChipDay(name){
  const p=selected.find(x=>x.name===name); if(!p) return;
  p.day = (p.day % totalDays) + 1;   // 다음 일차로 순환
  renderChips(); renderDayTabs();
  if(DAYS.length) generate(false);
}
// 일차별로 묶어서 칩 표시
function renderChips(){
  const el=$('#chips');
  if(!selected.length){ el.innerHTML='<div class="empty">위에서 장소를 검색해 추가하세요.</div>'; return; }
  el.innerHTML='';
  for(let d=1; d<=totalDays; d++){
    const items=selected.filter(p=>p.day===d);
    if(!items.length) continue;
    const c=DAY_COLORS[(d-1)%DAY_COLORS.length];
    const grp=document.createElement('div'); grp.className='chipday';
    grp.innerHTML=`<div class="chipday-h" style="color:${c}">DAY ${d}</div>`;
    const wrap=document.createElement('div'); wrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;';
    items.forEach(p=>{
      const chip=document.createElement('div'); chip.className='chip'; chip.style.borderColor=c+'66';
      chip.innerHTML=`<span class="daybadge" title="다른 일차로 이동">${p.day}</span><span>${p.name}</span><b title="삭제">✕</b>`;
      chip.querySelector('.daybadge').onclick=()=>moveChipDay(p.name);
      chip.querySelector('b').onclick=()=>removePlace(p.name);
      wrap.appendChild(chip);
    });
    grp.appendChild(wrap); el.appendChild(grp);
  }
}
function flashSearch(){ const s=$('#search'); s.style.borderColor='#f87171'; setTimeout(()=>s.style.borderColor='',600); }

// ---- 마커 ----
function clearMarkers(){ markerObjs.forEach(m=>m.marker.remove()); markerObjs=[]; }
function makeMarker(p, idx, cls, color){
  const el=document.createElement('div'); el.className='mk '+(cls||'');
  if(color) el.style.background=color;
  el.innerHTML=`<b>${idx!=null?idx:'•'}</b>`;
  const marker=new maplibregl.Marker({ element:el, anchor:'bottom' }).setLngLat([p.lng,p.lat]).addTo(map);
  // 마커 클릭 → 사진·이름 팝업
  const html=`<div class="pop">${p.img?`<img src="${p.img}" onerror="this.style.display='none'">`:''}
    <div class="pop-t">${(typeof ICONS!=='undefined'&&ICONS[p.cat])||'📍'} ${p.name}</div>
    ${p.desc?`<div class="pop-d">${p.desc}</div>`:''}</div>`;
  const popup=new maplibregl.Popup({ offset:26, closeButton:false, maxWidth:'240px' }).setHTML(html);
  marker.setPopup(popup);
  markerObjs.push({ marker, el, name:p.name });
  return el;
}
// 일정 생성 전: 추가된 장소 일차 색으로 미리보기
function previewMarkers(){
  if(DAYS.length) return; // 일정 생성됐으면 건너뜀
  selected.forEach(enrichPhoto);
  clearMarkers();
  selected.forEach(p=>{ const d=p.day||1; makeMarker(p, d, 'route', DAY_COLORS[(d-1)%DAY_COLORS.length]); });
  if(selected.length) fitTo(selected, 60);
}

// ---- 동선 정렬 (최근접 이웃) ----
function orderRoute(arr){
  const pts=arr.slice();
  let startIdx=pts.findIndex(p=>/공항|airport/i.test(p.name)); if(startIdx<0) startIdx=0;
  const route=[], used=new Array(pts.length).fill(false);
  let cur=startIdx; route.push(pts[cur]); used[cur]=true;
  for(let k=1;k<pts.length;k++){
    let best=-1,bd=Infinity;
    for(let j=0;j<pts.length;j++){ if(used[j])continue;
      const d=(pts[j].lng-pts[cur].lng)**2+(pts[j].lat-pts[cur].lat)**2;
      if(d<bd){bd=d;best=j;} }
    route.push(pts[best]); used[best]=true; cur=best;
  }
  return route;
}
function fmtMin(m){ if(!m) return '0분'; const h=Math.floor(m/60),mm=m%60; return (h?h+'시간':'')+(mm?(h?' ':'')+mm+'분':(h?'':'0분')); }

// ---- 일자 분할 = 지역 클러스터링 (결정적 k-means) ----
// "가까운 곳끼리 같은 날". 같은 장소 집합이면 항상 같은 결과 → 일자 경계가 흔들리지 않음.
const COS_LAT = Math.cos(33*Math.PI/180);
function dist2(a,b){ const dx=(a.lng-b.lng)*COS_LAT, dy=a.lat-b.lat; return dx*dx+dy*dy; }
function splitDays(places, D){
  const K=Math.min(D, places.length);
  if(K<=1) return [orderRoute(places)];
  // 결정적 초기 중심: 경도 정렬 후 균등 선택
  const sorted=places.slice().sort((a,b)=>(a.lng-b.lng)||(a.lat-b.lat));
  let cent=[]; for(let i=0;i<K;i++) cent.push({lng:sorted[Math.floor(i*(sorted.length-1)/(K-1))].lng, lat:sorted[Math.floor(i*(sorted.length-1)/(K-1))].lat});
  let groups;
  for(let it=0; it<16; it++){
    groups=Array.from({length:K},()=>[]);
    places.forEach(p=>{ let bi=0,bd=Infinity; for(let i=0;i<K;i++){ const d=dist2(p,cent[i]); if(d<bd){bd=d;bi=i;} } groups[bi].push(p); });
    cent=groups.map((g,i)=> g.length ? {lng:g.reduce((s,p)=>s+p.lng,0)/g.length, lat:g.reduce((s,p)=>s+p.lat,0)/g.length} : cent[i]);
  }
  groups=groups.filter(g=>g.length);
  // 그룹을 동선 순서로 정렬: 공항(없으면 최서단)에서 가까운 그룹부터
  groups.forEach(g=>{ g._c={lng:g.reduce((s,p)=>s+p.lng,0)/g.length, lat:g.reduce((s,p)=>s+p.lat,0)/g.length}; });
  const startP = places.find(p=>/공항|airport/i.test(p.name)) || sorted[0];
  const ordered=[]; const used=new Array(groups.length).fill(false);
  let ref=startP;
  for(let k=0;k<groups.length;k++){
    let best=-1,bd=Infinity;
    groups.forEach((g,i)=>{ if(used[i])return; const d=dist2(ref,g._c); if(d<bd){bd=d;best=i;} });
    used[best]=true; ordered.push(groups[best]); ref=groups[best]._c;
  }
  // 각 그룹 내부도 동선 정렬
  return ordered.map(g=>orderRoute(g));
}

// ---- 카메라 ----
function fitTo(places, padTop){
  if(!places.length) return;
  const b=new maplibregl.LngLatBounds();
  places.forEach(p=>b.extend([p.lng,p.lat]));
  if(places.length===1){ map.flyTo({ center:[places[0].lng,places[0].lat], zoom:12, pitch:55, bearing:-12, duration:1400 }); return; }
  map.fitBounds(b, { padding:{top:(padTop||80),bottom:80,left:380,right:80}, pitch:50, bearing:-10, duration:1600, maxZoom:13 });
}

// 관광공사 데이터에서 '이름이 일치'하는 사진만 찾음 (좌표만 가까운 옆 식당 사진 방지)
function photoForName(name, lng, lat){
  if(!TOUR.length) return null;
  const nn=norm(name); if(nn.length<2) return null;
  let best=null, bd=Infinity;
  for(const t of TOUR){
    if(!t.img) continue;
    const tn=norm(t.name);
    const nameMatch = (tn===nn) || (nn.length>=3 && tn.length>=3 && (tn.includes(nn)||nn.includes(tn)));
    if(!nameMatch) continue;
    const d=(t.lng-lng)**2+(t.lat-lat)**2;
    if(d<bd){ bd=d; best=t; }
  }
  // 이름이 같아도 5km 넘게 떨어지면 다른 장소로 보고 제외
  return (best && bd < 0.002) ? best.img : null;
}
// 선택 장소 사진 보강 (이름 일치 시에만)
function enrichPhoto(p){
  if(p.img) return;
  const im=photoForName(p.name, p.lng, p.lat);
  if(im) p.img=im;
}

// ---- 일정 생성 (사용자가 지정한 일차대로) ----
function generate(autoScroll){
  if(autoScroll===undefined) autoScroll=true;
  if(!mapReady){ toast('지도를 불러오는 중이에요. 잠시 후 다시 눌러주세요.'); return; }
  if(selected.length<1){ toast('먼저 장소를 추가하세요.'); flashSearch(); return; }
  selected.forEach(enrichPhoto);
  // 일차별로 그룹 (사용자 지정) → 각 일차 내부만 동선 정렬
  DAYS=[];
  for(let d=1; d<=totalDays; d++){
    const items=selected.filter(p=>p.day===d);
    if(!items.length) continue;
    DAYS.push({ idx:d, places:orderRoute(items), region:commonRegion(items) });
  }

  // 마커 다시 그리기 (일차별 색)
  clearMarkers();
  DAYS.forEach(d=>{ const c=DAY_COLORS[(d.idx-1)%DAY_COLORS.length]; d.places.forEach((p,pi)=> makeMarker(p, pi+1, 'route', c)); });

  // 경로 라인
  const feats=[];
  DAYS.forEach((d,di)=>{
    if(d.places.length<2) return;
    feats.push({ type:'Feature', properties:{ color:DAY_COLORS[di%DAY_COLORS.length] },
      geometry:{ type:'LineString', coordinates:d.places.map(p=>[p.lng,p.lat]) } });
  });
  map.getSource('routes')?.setData({ type:'FeatureCollection', features:feats });

  // 장소별 카드 (스크롤 = 한 곳씩 클로즈업)
  const it=$('#itinerary'); it.innerHTML='';
  let spotG=0;
  DAYS.forEach((d,di)=>{
    const c=DAY_COLORS[(d.idx-1)%DAY_COLORS.length];
    const stay=d.places.reduce((s,p)=>s+(p.dur||0),0);
    // 일자 시작 구분 헤더
    const head=document.createElement('section'); head.className='section dayhead'; head.dataset.day=d.idx;
    head.innerHTML=`<div class="dayhead-card"><span class="badge" style="background:linear-gradient(90deg,${c},#0ea5b7)">DAY ${d.idx}</span>
      <span class="dh-title">${d.region} 코스</span>
      <span class="dh-sub">${d.places.length}곳 · ${stay?'체류 약 '+fmtMin(stay):''}</span></div>`;
    it.appendChild(head);

    d.places.forEach((p,pi)=>{
      const gi=spotG++;
      const sec=document.createElement('section'); sec.className='section'; sec.dataset.day=d.idx;
      const img = p.img ? `<img class="spot-img" src="${p.img}" alt="${p.name}" loading="lazy" onerror="this.style.display='none'">` : '';
      const meta=[regionOf(p), p.cat, p.dur?fmtMin(p.dur):''].filter(Boolean).join(' · ');
      const tel = p.tel ? `<div class="spot-tel">📞 ${p.tel}</div>` : '';
      sec.innerHTML=`<div class="spot" style="--c:${c}">
        <div class="spot-top"><span class="spot-no" style="background:${c}">${pi+1}</span>
          <span class="spot-day">DAY ${d.idx} · ${regionOf(p)}</span></div>
        ${img}
        <h2>${(typeof ICONS!=='undefined'&&ICONS[p.cat])||'📍'} ${p.name}</h2>
        <div class="spot-meta">${meta}</div>
        <p class="spot-desc">${p.desc||''}</p>${tel}</div>`;
      it.appendChild(sec);
      const card=sec.querySelector('.spot');
      triggers.push(ScrollTrigger.create({ trigger:sec, start:'top 65%', end:'bottom 35%',
        onToggle:self=>{ if(self.isActive) focusSpot(p,gi,di,card); },
        onEnter:()=>focusSpot(p,gi,di,card), onEnterBack:()=>focusSpot(p,gi,di,card) }));
    });
  });
  $('#end').style.display='flex';
  savePlan();
  ScrollTrigger.refresh();
  // 명시적 생성 시: 패널을 접어 지도를 넓게, 맨 위로 올려 '전체 루트'부터 보여줌
  if(autoScroll){ $('#panel').classList.add('min'); overview(); scrollTo({top:0,behavior:'smooth'}); }
}

// 한 장소만 클로즈업
function focusSpot(p, gi, di, card){
  document.querySelectorAll('.spot').forEach(c=>c.classList.remove('in'));
  card && card.classList.add('in');
  markerObjs.forEach(m=> m.el.classList.toggle('active', m.name===p.name));
  const bearing = -12 + gi*16;   // 장소마다 살짝 회전 → 지도가 돌아가는 느낌
  // 장소를 화면 정중앙에 정확히 (padding/offset이 오히려 어긋나게 했음)
  map.flyTo({ center:[p.lng,p.lat], zoom:16.3, pitch:60, bearing, duration:2400, curve:1.5, essential:true });
}

function focusDay(d, di, card){
  const bearing = -12 + di*45;
  const names=new Set(d.places.map(p=>p.name));
  markerObjs.forEach(m=> m.el.classList.toggle('active', names.has(m.name)));
  if(d.places.length===1){
    map.flyTo({ center:[d.places[0].lng,d.places[0].lat], zoom:16, pitch:62, bearing, duration:1900, essential:true });
  }else{
    const b=new maplibregl.LngLatBounds(); d.places.forEach(p=>b.extend([p.lng,p.lat]));
    const cam=map.cameraForBounds(b, { padding:{top:100,bottom:120,left:420,right:100}, bearing, pitch:60, maxZoom:16.5 });
    if(cam) map.easeTo({ ...cam, pitch:60, bearing, duration:1900, essential:true });
    else map.flyTo({ center:b.getCenter(), zoom:14, pitch:60, bearing, duration:1900 });
  }
}
function overview(){ markerObjs.forEach(m=>m.el.classList.remove('active')); if(selected.length) fitTo(selected,80); }

ScrollTrigger.create({ trigger:'.hero', start:'top 40%', end:'bottom 30%', onEnter:overview, onEnterBack:overview });

// ---- 이벤트 ----
$('#add').onclick=()=>addByName($('#search').value);
$('#search').addEventListener('input', e=>renderAC(e.target.value));
$('#search').addEventListener('keydown', e=>{
  if(e.key==='ArrowDown'){ e.preventDefault(); moveAC(1); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); moveAC(-1); }
  else if(e.key==='Enter'){
    e.preventDefault();
    if(acSel>=0 && acMatches[acSel]) chooseAC(acSel);
    else addByName(e.target.value);
  } else if(e.key==='Escape'){ hideAC(); }
});
$('#search').addEventListener('focus', e=>{ if(e.target.value) renderAC(e.target.value); });
document.addEventListener('click', e=>{ if(!e.target.closest('.searchbox')) hideAC(); });
$('#gen').onclick=()=>generate(true);
$('#nearme')?.addEventListener('click', findNearMe);
$('#toggle').onclick=()=>$('#panel').classList.toggle('min');
$('#reset').onclick=resetAll;

// 총 여행일 변경
$('#days').addEventListener('change', e=>{
  totalDays=parseInt(e.target.value,10);
  if(activeDay>totalDays) activeDay=totalDays;
  // 초과 일차의 장소는 마지막 일차로 이동
  selected.forEach(p=>{ if(p.day>totalDays) p.day=totalDays; });
  renderDayTabs(); renderChips();
  if(DAYS.length) generate(false);
});

// 자동배치: 가까운 곳끼리 일차 자동 분배
$('#auto').onclick=()=>{
  if(selected.length<1){ toast('먼저 장소를 추가하세요.'); return; }
  const groups=splitDays(selected, totalDays);
  groups.forEach((g,i)=> g.forEach(p=>{ p.day=i+1; }));
  renderDayTabs(); renderChips();
  if(mapReady) generate(true); else pendingRestore=()=>generate(true);
  toast('가까운 곳끼리 일차를 자동 배치했어요. 칩의 숫자를 눌러 바꿀 수 있어요.');
};

renderDayTabs();   // 초기 일차 탭

function resetAll(){
  selected=[]; DAYS=[]; activeDay=1; renderChips(); renderDayTabs();
  triggers.forEach(t=>t.kill()); triggers=[];
  clearMarkers(); map.getSource('routes')?.setData({type:'FeatureCollection',features:[]});
  $('#itinerary').innerHTML=''; $('#end').style.display='none';
  $('#panel').classList.remove('min');
  try{ localStorage.removeItem('jeju_plan_v2'); }catch(e){}
  map.flyTo({ center:REGION.center, zoom:REGION.zoom, pitch:55, bearing:-12, duration:1400 });
  scrollTo({top:0,behavior:'smooth'});
}

/* ===== 저장 · 공유 · 인쇄 ===== */
// 사진(img)은 저장하지 않음 → 복원 시 항상 '이름 일치'로 새로 맞춤(잘못된 사진이 남지 않게)
function planData(){ return { v:2, days:totalDays, places:selected.map(({img, ...r})=>r) }; }
function savePlan(){ try{ localStorage.setItem('jeju_plan_v2', JSON.stringify(planData())); }catch(e){} }
function encodePlan(p){ return btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function decodePlan(s){ try{ s=s.replace(/-/g,'+').replace(/_/g,'/'); return JSON.parse(decodeURIComponent(escape(atob(s)))); }catch(e){ return null; } }
function sharePlan(){
  if(!selected.length){ toast('먼저 장소를 추가하세요.'); return; }
  const url=location.origin+location.pathname+'?p='+encodePlan(planData());
  const done=()=>toast('공유 링크가 복사됐어요! 붙여넣기로 전달하세요.');
  if(navigator.clipboard) navigator.clipboard.writeText(url).then(done,()=>prompt('아래 링크를 복사하세요:',url));
  else prompt('아래 링크를 복사하세요:',url);
}
function printPlan(){ if(!DAYS.length){ toast('먼저 일정을 생성하세요.'); return; } window.print(); }
$('#save').onclick=()=>{ if(!selected.length){toast('먼저 장소를 추가하세요.');return;} savePlan(); toast('이 기기에 저장했어요. 다음에 열면 자동으로 불러옵니다.'); };
$('#share').onclick=sharePlan;
$('#print').onclick=printPlan;

function toast(msg){
  let t=$('#toast'); if(!t){ t=document.createElement('div'); t.id='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.className='show'; clearTimeout(toast._t); toast._t=setTimeout(()=>t.className='',2800);
}

// ---- 복원 (공유링크 > 저장본) ----
let pendingRestore=null;
(function restore(){
  const q=new URLSearchParams(location.search).get('p');
  let p=q?decodePlan(q):null;
  if(!p){ try{ p=JSON.parse(localStorage.getItem('jeju_plan_v2')||'null'); }catch(e){} }
  if(p && Array.isArray(p.places) && p.places.length){
    selected=p.places.filter(x=>x&&typeof x.lng==='number'&&typeof x.lat==='number');
    selected.forEach(x=>{ if(!x.day) x.day=1; delete x.img; });   // 옛 저장본의 잘못된 사진 제거 → 재매칭
    if(p.days){ totalDays=p.days; $('#days').value=p.days; }
    if(activeDay>totalDays) activeDay=totalDays;
    renderDayTabs(); renderChips();
    const run=()=>{ previewMarkers(); if(q) setTimeout(()=>generate(true),500); };
    mapReady ? run() : (pendingRestore=run);
  }
})();

// 진행 바
addEventListener('scroll', ()=>{ const h=document.documentElement; const r=h.scrollTop/(h.scrollHeight-h.clientHeight||1); $('#progress').style.width=(r*100)+'%'; });
