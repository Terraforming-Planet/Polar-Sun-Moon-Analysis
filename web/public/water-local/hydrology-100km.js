const OVERPASS='https://overpass-api.de/api/interpreter';
let hydroEntities=[];
let localHydro=[];

function hav(lat1,lon1,lat2,lon2){
  const r=6371000,d=Math.PI/180;
  const a=Math.sin((lat2-lat1)*d/2)**2+Math.cos(lat1*d)*Math.cos(lat2*d)*Math.sin((lon2-lon1)*d/2)**2;
  return 2*r*Math.asin(Math.sqrt(a));
}

function centerOf(el){
  if(Number.isFinite(el.lat)&&Number.isFinite(el.lon))return {lat:el.lat,lon:el.lon};
  if(el.center&&Number.isFinite(el.center.lat)&&Number.isFinite(el.center.lon))return el.center;
  return null;
}

function clearHydrology(){
  hydroEntities.forEach(e=>viewer.entities.remove(e));
  hydroEntities=[];
  localHydro=[];
}

function addHydroMarker(id,label,lon,lat,color){
  const e=viewer.entities.add({
    id,
    position:Cesium.Cartesian3.fromDegrees(lon,lat),
    point:{pixelSize:6,color:Cesium.Color.fromCssColorString(color),outlineColor:Cesium.Color.BLACK,outlineWidth:1,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND},
    label:{text:label,font:'11px sans-serif',fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-14),distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0,70000)}
  });
  hydroEntities.push(e);
}

function overpass(query){
  return fetch(OVERPASS,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(query)})
    .then(r=>r.ok?r.json():Promise.reject(new Error('Overpass HTTP '+r.status)));
}

function renderRegional(elements){
  const seen=new Set();let lakes=0,waterways=0;
  for(const el of elements){
    const c=centerOf(el),t=el.tags||{},name=t.name;
    if(!c||!name)continue;
    const kind=t.waterway?'waterway':'waterbody';
    const key=`${kind}:${name}:${c.lat.toFixed(4)}:${c.lon.toFixed(4)}`;
    if(seen.has(key))continue;
    seen.add(key);
    if(kind==='waterway')waterways++;else lakes++;
    addHydroMarker('hydro-'+el.type+'-'+el.id,name,c.lon,c.lat,kind==='waterway'?'#63e6ff':'#4e8dff');
  }
  return {lakes,waterways};
}

function renderLocalWays(elements){
  localHydro=[];
  for(const el of elements){
    if(!Array.isArray(el.geometry)||el.geometry.length<2)continue;
    const coords=[];
    for(const p of el.geometry)coords.push(p.lon,p.lat);
    const entity=viewer.entities.add({
      id:'local-way-'+el.id,
      polyline:{positions:Cesium.Cartesian3.fromDegreesArray(coords),width:el.tags?.waterway==='river'?3:2,material:Cesium.Color.fromCssColorString('#55dfff').withAlpha(.82),clampToGround:true}
    });
    hydroEntities.push(entity);localHydro.push(el);
  }
}

function nearestLocal(lat,lon){
  let best=null;
  for(const el of localHydro){
    for(const p of el.geometry||[]){
      const d=hav(lat,lon,p.lat,p.lon);
      if(!best||d<best.d)best={d,name:el.tags?.name||el.tags?.waterway||'ciek bez nazwy',kind:el.tags?.waterway||'waterway'};
    }
  }
  return best;
}

function pinCoord(storage){
  try{const p=JSON.parse(localStorage.getItem(storage)||'null');return p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)?p:null}catch{return null}
}

function updateCandidates(){
  const pts=[
    {name:'Jezioro Kuchnia',lat:53.58809,lon:19.01969},
    {name:'Staw w lesie / Jezioro Panieńskie',...(pinCoord('tp-olszowka-pond-pin')||{})},
    {name:'Mały akwen przy Kuchni',...(pinCoord('tp-kuchnia-small-pin')||{})},
    {name:'Jezioro Kamień',...(pinCoord('tp-kamien-pin')||{})}
  ].filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  const rows=pts.map(p=>{
    const n=nearestLocal(p.lat,p.lon);
    if(!n)return `<div class="result"><b>${p.name}</b><div class="tiny">Brak lokalnej geometrii cieku — weryfikacja Hydroportal.</div></div>`;
    const close=n.d<300;
    return `<div class="result"><b>${p.name}</b><div class="${close?'warn':'tiny'}">Najbliższy publicznie zmapowany ciek: ${n.name} · ok. ${Math.round(n.d)} m. ${close?'KANDYDAT POŁĄCZENIA DO INSPEKCJI — nie potwierdzone uszkodzenie.':'To nie dowodzi bezpośredniego połączenia.'}</div></div>`;
  }).join('');
  return rows||'<p class="tiny">Ustaw piny, aby policzyć najbliższe zmapowane cieki.</p>';
}

async function loadHydrology100km(){
  const button=document.getElementById('hydrology-100km');
  button.disabled=true;button.textContent='⏳ Ładowanie hydrologii…';
  status.innerHTML='<b>Hydrologia 100 km</b><br>Pobieram publiczną warstwę OSM/Overpass. Hydroportal pozostaje źródłem rozstrzygającym dla urzędowej geometrii.';
  clearHydrology();
  try{
    const regional=`[out:json][timeout:45];(nwr(around:100000,${focus.lat},${focus.lon})["natural"="water"]["name"];nwr(around:100000,${focus.lat},${focus.lon})["water"~"lake|reservoir|pond"]["name"];nwr(around:100000,${focus.lat},${focus.lon})["waterway"~"river|stream|canal"]["name"];);out center tags;`;
    const local=`[out:json][timeout:35];way(around:15000,${focus.lat},${focus.lon})["waterway"~"river|stream|canal|ditch|drain"];out geom tags;`;
    const [regionalData,localData]=await Promise.all([overpass(regional),overpass(local)]);
    const counts=renderRegional(regionalData.elements||[]);
    renderLocalWays(localData.elements||[]);
    document.getElementById('hydrology-summary').innerHTML=`<article class="card"><h3>100 km · warstwa referencyjna</h3><div class="fact"><span>Nazwane jeziora/zbiorniki</span><b>${counts.lakes}</b></div><div class="fact"><span>Nazwane rzeki/strumienie/kanały</span><b>${counts.waterways}</b></div><div class="fact"><span>Lokalne cieki z geometrią ≤15 km</span><b>${localHydro.length}</b></div><p class="tiny">OSM/Overpass może mieć braki; pełny urzędowy graf musi być porównany z Hydroportalem.</p></article><article class="card"><h3>Kandydaci do inspekcji</h3><div class="list">${updateCandidates()}</div></article>`;
    status.innerHTML=`<b>Hydrologia 100 km załadowana</b><br>Jeziora/zbiorniki: ${counts.lakes}; cieki nazwane: ${counts.waterways}; lokalne geometrie: ${localHydro.length}. Żaden kandydat nie jest automatycznie uznawany za uszkodzony dopływ/odpływ.`;
    viewer.scene.requestRender();
  }catch(err){
    document.getElementById('hydrology-summary').innerHTML=`<article class="card"><h3 class="bad">Nie udało się pobrać warstwy 100 km</h3><p class="tiny">${String(err)}</p><p class="tiny">Mapa bazowa i oficjalne źródła pozostają dostępne.</p></article>`;
    status.textContent='Błąd warstwy 100 km: '+String(err);
  }finally{
    button.disabled=false;button.textContent='💧 Jeziora i rzeki · 100 km';
  }
}

document.getElementById('hydrology-100km')?.addEventListener('click',loadHydrology100km);
