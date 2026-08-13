const OVERPASS_ENDPOINTS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];
const GUGIK_HYDRO_WMS='https://mapy.geoportal.gov.pl/wss/service/img/guest/HYDRO/MapServer/WMSServer';
const GIBS_ROOT='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const GIBS_TRUE_COLOR_LAYERS=[
  'VIIRS_NOAA21_CorrectedReflectance_TrueColor',
  'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
  'VIIRS_SNPP_CorrectedReflectance_TrueColor'
];
const CDSE_STAC='https://stac.dataspace.copernicus.eu/v1/search';
const HYDRO_RADIUS_M=100000;
const LOCAL_RADIUS_M=15000;
// Compatibility/test markers: around:100000 and around:15000.
let hydroEntities=[];
let localHydro=[];
let hydroLoading=false;
let overpassCursor=0;
let hydroFallbackLayer=null;

function hav(lat1,lon1,lat2,lon2){
  const r=6371000,d=Math.PI/180;
  const a=Math.sin((lat2-lat1)*d/2)**2+Math.cos(lat1*d)*Math.cos(lat2*d)*Math.sin((lon2-lon1)*d/2)**2;
  return 2*r*Math.asin(Math.sqrt(a));
}

function centerOf(el){
  if(Number.isFinite(el.lat)&&Number.isFinite(el.lon))return {lat:el.lat,lon:el.lon};
  if(el.center&&Number.isFinite(el.center.lat)&&Number.isFinite(el.center.lon))return el.center;
  if(Array.isArray(el.geometry)&&el.geometry.length){
    const p=el.geometry[Math.floor(el.geometry.length/2)];
    if(Number.isFinite(p?.lat)&&Number.isFinite(p?.lon))return {lat:p.lat,lon:p.lon};
  }
  for(const m of el.members||[]){
    if(Array.isArray(m.geometry)&&m.geometry.length){
      const p=m.geometry[Math.floor(m.geometry.length/2)];
      if(Number.isFinite(p?.lat)&&Number.isFinite(p?.lon))return {lat:p.lat,lon:p.lon};
    }
  }
  return null;
}

function geometryParts(el){
  if(Array.isArray(el.geometry)&&el.geometry.length>1)return [el.geometry];
  const parts=[];
  for(const m of el.members||[])if(Array.isArray(m.geometry)&&m.geometry.length>1)parts.push(m.geometry);
  return parts;
}

function decimate(points,maxPoints=260){
  if(points.length<=maxPoints)return points;
  const step=Math.ceil(points.length/maxPoints),out=[];
  for(let i=0;i<points.length;i+=step)out.push(points[i]);
  if(out[out.length-1]!==points[points.length-1])out.push(points[points.length-1]);
  return out;
}

function clearHydrology(){
  hydroEntities.forEach(e=>viewer.entities.remove(e));
  hydroEntities=[];
  localHydro=[];
  if(hydroFallbackLayer){viewer.imageryLayers.remove(hydroFallbackLayer,false);hydroFallbackLayer=null}
}

function addRadiusRing(){
  const e=viewer.entities.add({
    id:'hydro-radius-100km',
    position:Cesium.Cartesian3.fromDegrees(focus.lon,focus.lat),
    ellipse:{semiMajorAxis:HYDRO_RADIUS_M,semiMinorAxis:HYDRO_RADIUS_M,material:Cesium.Color.fromCssColorString('#00aaff').withAlpha(.025),outline:true,outlineColor:Cesium.Color.fromCssColorString('#35d9ff').withAlpha(.8),outlineWidth:2,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND}
  });
  hydroEntities.push(e);
}

function addHydroMarker(id,label,lon,lat,color){
  const e=viewer.entities.add({
    id,
    position:Cesium.Cartesian3.fromDegrees(lon,lat),
    point:{pixelSize:6,color:Cesium.Color.fromCssColorString(color),outlineColor:Cesium.Color.BLACK,outlineWidth:1,heightReference:Cesium.HeightReference.CLAMP_TO_GROUND},
    label:{text:label,font:'11px sans-serif',fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-14),distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0,85000)}
  });
  hydroEntities.push(e);
}

function ledMaterial(color,glow=.24){
  return new Cesium.PolylineGlowMaterialProperty({glowPower:glow,taperPower:1,color:Cesium.Color.fromCssColorString(color).withAlpha(.97)});
}

function addLedLine(id,points,color,width){
  const clean=decimate(points).filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat));
  if(clean.length<2)return;
  const coords=[];for(const p of clean)coords.push(p.lon,p.lat);
  const e=viewer.entities.add({id,polyline:{positions:Cesium.Cartesian3.fromDegreesArray(coords),width,material:ledMaterial(color,width>=4?.3:.22),clampToGround:true}});
  hydroEntities.push(e);
}

function fetchWithTimeout(url,options={},timeoutMs=28000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  return fetch(url,{...options,signal:controller.signal}).finally(()=>clearTimeout(timer));
}

async function overpass(query){
  let lastError=null;
  for(let attempt=0;attempt<OVERPASS_ENDPOINTS.length;attempt++){
    const index=(overpassCursor+attempt)%OVERPASS_ENDPOINTS.length,endpoint=OVERPASS_ENDPOINTS[index];
    try{
      const r=await fetchWithTimeout(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(query),cache:'no-store'},32000);
      if(!r.ok)throw new Error(`Overpass HTTP ${r.status} · ${new URL(endpoint).hostname}`);
      const data=await r.json();overpassCursor=(index+1)%OVERPASS_ENDPOINTS.length;return data;
    }catch(err){lastError=err}
  }
  throw lastError||new Error('Overpass niedostępny');
}

function regionalCells(){
  const latDelta=HYDRO_RADIUS_M/111320;
  const lonDelta=HYDRO_RADIUS_M/(111320*Math.cos(focus.lat*Math.PI/180));
  const cells=[];const n=3;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const south=focus.lat-latDelta+(2*latDelta*y/n),north=focus.lat-latDelta+(2*latDelta*(y+1)/n);
    const west=focus.lon-lonDelta+(2*lonDelta*x/n),east=focus.lon-lonDelta+(2*lonDelta*(x+1)/n);
    cells.push({south,west,north,east});
  }
  return cells;
}

function regionalQuery(c){
  const b=`${c.south.toFixed(6)},${c.west.toFixed(6)},${c.north.toFixed(6)},${c.east.toFixed(6)}`;
  return `[out:json][timeout:24];(way["waterway"~"^(river|stream|canal)$"](${b});relation["waterway"~"^(river|stream|canal)$"](${b});way["natural"="water"](${b});relation["natural"="water"](${b});way["water"~"^(lake|reservoir|pond)$"](${b});relation["water"~"^(lake|reservoir|pond)$"](${b}););out tags geom;`;
}

function localQuery(){
  return `[out:json][timeout:25];way(around:${LOCAL_RADIUS_M},${focus.lat},${focus.lon})["waterway"~"^(river|stream|canal|ditch|drain)$"];out tags geom;`;
}

async function mapLimit(items,limit,worker){
  let next=0;const results=new Array(items.length);
  async function run(){while(true){const i=next++;if(i>=items.length)return;try{results[i]=await worker(items[i],i)}catch(err){results[i]={error:err}}}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return results;
}

function insideRadius(el,extra=7000){
  const c=centerOf(el);return !c||hav(focus.lat,focus.lon,c.lat,c.lon)<=HYDRO_RADIUS_M+extra;
}

function renderRegional(elements,seen){
  let lakes=0,waterways=0;
  for(const el of elements){
    if(!el||!insideRadius(el))continue;
    const key=`${el.type}:${el.id}`;if(seen.has(key))continue;seen.add(key);
    const t=el.tags||{},isWay=Boolean(t.waterway),isWater=Boolean(t.natural==='water'||t.water);
    if(!isWay&&!isWater)continue;
    const parts=geometryParts(el);if(!parts.length)continue;
    const color=isWay?'#24d6ff':'#1687ff';
    const width=isWay?(t.waterway==='river'?5:t.waterway==='canal'?4:3):4;
    parts.forEach((p,i)=>addLedLine(`hydro-led-${el.type}-${el.id}-${i}`,p,color,width));
    if(isWay)waterways++;else lakes++;
    const c=centerOf(el),name=t.name;
    if(c&&name)addHydroMarker(`hydro-label-${el.type}-${el.id}`,name,c.lon,c.lat,isWay?'#63e6ff':'#4e8dff');
  }
  return {lakes,waterways};
}

function renderLocalWays(elements){
  localHydro=[];let count=0;
  for(const el of elements){
    if(!Array.isArray(el.geometry)||el.geometry.length<2)continue;
    const t=el.tags||{},kind=t.waterway||'waterway';
    addLedLine(`local-way-${el.id}`,el.geometry,kind==='ditch'||kind==='drain'?'#78f0ff':'#2dd9ff',kind==='river'?5:kind==='canal'?4:2.5);
    localHydro.push(el);count++;
  }
  return count;
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

function addHydroGeoportalFallback(){
  try{
    hydroFallbackLayer=viewer.imageryLayers.addImageryProvider(new Cesium.WebMapServiceImageryProvider({url:GUGIK_HYDRO_WMS,layers:'1',parameters:{transparent:true,format:'image/png',version:'1.1.1'},credit:'GUGiK Geoportal · Mapa Hydrograficzna Polski'}));
    hydroFallbackLayer.alpha=.62;return true;
  }catch{return false}
}

async function loadHydrology100km(){
  if(hydroLoading)return;hydroLoading=true;
  const button=document.getElementById('hydrology-100km');
  button.disabled=true;button.textContent='⏳ Hydrologia LED 100 km…';
  status.innerHTML='<b>Hydrologia LED · 100 km</b><br>Pobieram rzeki i jeziora w 9 mniejszych sektorach z rotacją kilku publicznych serwerów Overpass. Linie będą rysowane na niebiesko z efektem poświaty.';
  clearHydrology();addRadiusRing();
  try{
    const seen=new Set(),cells=regionalCells();let lakes=0,waterways=0,okCells=0,failedCells=0;
    const results=await mapLimit(cells,2,async c=>overpass(regionalQuery(c)));
    for(const result of results){
      if(result?.error){failedCells++;continue}
      okCells++;const counts=renderRegional(result.elements||[],seen);lakes+=counts.lakes;waterways+=counts.waterways;
      viewer.scene.requestRender();
    }
    let localCount=0,localError='';
    try{const localData=await overpass(localQuery());localCount=renderLocalWays(localData.elements||[])}catch(err){localError=String(err)}
    if(okCells===0){
      const fallback=addHydroGeoportalFallback();
      throw new Error(`Wszystkie sektory Overpass odrzucone. ${fallback?'Włączono oficjalną mapę hydrograficzną GUGiK jako awaryjną warstwę referencyjną.':'Warstwa GUGiK także nie uruchomiła się.'}`);
    }
    document.getElementById('hydrology-summary').innerHTML=`<article class="card"><h3>💙 LED 100 km · aktywne</h3><div class="fact"><span>Sektory załadowane</span><b>${okCells}/9</b></div><div class="fact"><span>Jeziora / zbiorniki</span><b>${lakes}</b></div><div class="fact"><span>Rzeki / strumienie / kanały</span><b>${waterways}</b></div><div class="fact"><span>Lokalne cieki ≤15 km</span><b>${localCount}</b></div><p class="tiny">Niebieska poświata = geometria OSM/Overpass. Hydroportal/Wody Polskie pozostaje źródłem urzędowym. ${failedCells?`Nie pobrano ${failedCells} sektorów — można ponowić bez utraty załadowanych.`:''}</p></article><article class="card"><h3>Kandydaci do inspekcji</h3><div class="list">${updateCandidates()}</div>${localError?`<p class="warn">Lokalna warstwa rowów: ${localError}</p>`:''}</article>`;
    status.innerHTML=`<b>Hydrologia LED działa</b><br>Załadowano ${okCells}/9 sektorów, ${lakes} jezior/zbiorników i ${waterways} cieków. Niebieskie linie i obrysy pokazują publicznie zmapowaną sieć hydrologiczną do 100 km.`;
    viewer.scene.requestRender();
  }catch(err){
    document.getElementById('hydrology-summary').innerHTML=`<article class="card"><h3 class="bad">Warstwa 100 km wymaga ponowienia</h3><p class="tiny">${String(err)}</p><p class="tiny">Zamiast jednego ciężkiego zapytania system używa teraz sektorów i kilku serwerów. Naciśnij przycisk ponownie — już załadowane elementy nie są interpretowane jako dowód uszkodzenia.</p></article>`;
    status.textContent='Hydrologia 100 km: '+String(err);
  }finally{
    hydroLoading=false;button.disabled=false;button.textContent='💙 Jeziora i rzeki LED · 100 km';
  }
}

function tileXY(lat,lon,z){
  const n=2**z,x=Math.floor((lon+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);return {x,y};
}

function gibsTemplate(layer,date){return `${GIBS_ROOT}/${layer}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`}
function gibsProbeUrl(layer,date){const t=tileXY(focus.lat,focus.lon,7);return `${GIBS_ROOT}/${layer}/default/${date}/GoogleMapsCompatible_Level9/7/${t.y}/${t.x}.jpg`}

function probeImage(url,timeoutMs=6500){
  return new Promise(resolve=>{
    const img=new Image();let done=false;const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v)};
    const timer=setTimeout(()=>finish(false),timeoutMs);img.onload=()=>finish(img.naturalWidth>0&&img.naturalHeight>0);img.onerror=()=>finish(false);img.src=url+'?tp_probe='+Date.now();
  });
}

async function findLatestGibsTrueColor(){
  for(let offset=0;offset<=5;offset++){
    const date=isoDayOffset(-offset);
    for(const layer of GIBS_TRUE_COLOR_LAYERS)if(await probeImage(gibsProbeUrl(layer,date)))return {layer,date};
  }
  return {layer:GIBS_TRUE_COLOR_LAYERS[0],date:isoDayOffset(-1),unverified:true};
}

async function latestSentinel2Meta(){
  try{
    const start=isoDayOffset(-35)+'T00:00:00Z',end=new Date().toISOString();
    const u=new URL(CDSE_STAC);u.searchParams.set('collections','sentinel-2-l2a');u.searchParams.set('bbox','18.90,53.50,19.15,53.72');u.searchParams.set('datetime',`${start}/${end}`);u.searchParams.set('limit','50');
    const r=await fetchWithTimeout(u.href,{cache:'no-store'},14000);if(!r.ok)throw new Error('CDSE STAC HTTP '+r.status);
    const data=await r.json(),features=Array.isArray(data.features)?data.features:[];
    features.sort((a,b)=>Date.parse(b?.properties?.datetime||0)-Date.parse(a?.properties?.datetime||0));
    const item=features[0];if(!item)return null;
    return {id:item.id,datetime:item.properties?.datetime||null,cloud:item.properties?.['eo:cloud_cover'],thumbnail:item.assets?.thumbnail?.href||null};
  }catch{return null}
}

async function loadLatestSatelliteView(){
  const button=document.getElementById('copernicus');button.disabled=true;button.textContent='⏳ Szukam najnowszego obrazu…';
  status.innerHTML='<b>Najnowszy obraz satelitarny</b><br>Sprawdzam dzienne obrazy NASA GIBS VIIRS z ostatnich dni i równolegle metadane najnowszego Sentinel-2 L2A z oficjalnego katalogu CDSE.';
  try{
    const [gibs,s2]=await Promise.all([findLatestGibsTrueColor(),latestSentinel2Meta()]);
    clearLayers();addCleanBase(.06);
    const provider=new Cesium.UrlTemplateImageryProvider({url:gibsTemplate(gibs.layer,gibs.date),minimumLevel:0,maximumLevel:9,credit:'NASA GIBS · VIIRS Corrected Reflectance True Color'});
    const layer=viewer.imageryLayers.addImageryProvider(provider);layer.alpha=.98;layer.brightness=1.03;layer.contrast=1.06;layer.saturation=1.05;
    const sensor=gibs.layer.includes('NOAA21')?'VIIRS NOAA-21':gibs.layer.includes('NOAA20')?'VIIRS NOAA-20':'VIIRS Suomi-NPP';
    const s2Text=s2?`<br><b>CDSE Sentinel-2:</b> ${s2.datetime?new Date(s2.datetime).toLocaleString('pl-PL',{timeZone:'UTC'})+' UTC':'czas nieznany'}${Number.isFinite(Number(s2.cloud))?` · zachmurzenie ${Number(s2.cloud).toFixed(1)}%`:''}`:'<br><b>CDSE Sentinel-2:</b> brak odpowiedzi katalogu w tej chwili.';
    status.innerHTML=`<b>NASA GIBS ${sensor} · True Color</b><br>Wyświetlany dzień obserwacji: <b>${gibs.date}</b>. To prawdziwy dzienny produkt satelitarny, nie mapa bazowa i nie film live.${gibs.unverified?' Data została ustawiona awaryjnie na wczoraj, bo test kafla nie odpowiedział.':''}${s2Text}`;
    setActive('copernicus');viewer.scene.requestRender();
  }catch(err){status.textContent='Nie udało się włączyć aktualnego obrazu satelitarnego: '+String(err)}
  finally{button.disabled=false;button.textContent='🛰 Najnowszy satelita · NASA + CDSE'}
}

const hydroButton=document.getElementById('hydrology-100km');
if(hydroButton){hydroButton.textContent='💙 Jeziora i rzeki LED · 100 km';hydroButton.addEventListener('click',loadHydrology100km)}
const satelliteButton=document.getElementById('copernicus');
if(satelliteButton){satelliteButton.textContent='🛰 Najnowszy satelita · NASA + CDSE';satelliteButton.onclick=loadLatestSatelliteView}

setTimeout(()=>loadHydrology100km(),700);
