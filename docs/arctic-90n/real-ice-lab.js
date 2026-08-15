import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const $=id=>document.getElementById(id), fmt=(n,d=1)=>Number(n).toLocaleString('pl-PL',{maximumFractionDigits:d});
function state(){return{b:+$('b').value,t:+$('t').value,h:+$('h').value,d:+$('d').value,v:+$('v').value,ice:+$('ice').value,iceThick:+$('iceThick').value,iceFront:+$('iceFront').value,iceConc:+$('iceConc').value,iceLen:+$('iceLen').value,iceRho:+$('iceRho').value}}
function geom(x=state()){const{b,t,h,d,v,ice}=x,bw=b+(t-b)*(d/h),V=h/3*(b*b+b*t+t*t),Vs=d/3*(b*b+b*bw+bw*bw),mass=2700*V*1e9,eff=(2700*V-1025*Vs)*1e9,P=eff*9.81/(b*b*1e6)/1e6,slope=Math.atan(h/((b-t)/2))*180/Math.PI,A=d*1e3*((b+bw)/2*1e3),drag=.5*1025*1.2*A*v*v,iceIndex=(b*ice*ice)/(8*0.08*0.08);return{bw,V,Vs,mass,eff,P,slope,drag,iceIndex}}
function getIceProfile(s=state()){
  let name='lato / lód rozdrobniony', dominant='medium floe 100–500 m';
  let mix={small:0.24, medium:0.44, big:0.22, vast:0.08, giant:0.02};
  if(s.iceThick>=2.5 && s.iceConc>=85){
    name='lód wieloletni / stress test';
    dominant='big floe 500–2000 m';
    mix={small:0.06, medium:0.18, big:0.42, vast:0.24, giant:0.10};
  } else if(s.iceThick>=1.5 && s.iceConc>=75){
    name='zima / zwarty pak';
    dominant='big floe 500–2000 m';
    mix={small:0.10, medium:0.28, big:0.38, vast:0.18, giant:0.06};
  }
  return {name, dominant, mix};
}
function mixText(m){return `S ${Math.round(m.small*100)}% · M ${Math.round(m.medium*100)}% · B ${Math.round(m.big*100)}% · V ${Math.round(m.vast*100)}% · G ${Math.round(m.giant*100)}%`;}

const viewer=$('viewer'), renderer=new THREE.WebGLRenderer({antialias:true,alpha:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); viewer.appendChild(renderer.domElement);
const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(0x04101a,.02);
const camera=new THREE.PerspectiveCamera(48,1,.1,400); camera.position.set(20,12,24);
const controls=new OrbitControls(camera,renderer.domElement); controls.target.set(0,-1,0); controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xc5efff,0x072030,2.1)); const sun=new THREE.DirectionalLight(0xffffff,2.6); sun.position.set(15,22,10); scene.add(sun);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(100,100), new THREE.MeshPhongMaterial({color:0x0b5b78,transparent:true,opacity:.38,side:THREE.DoubleSide})); sea.rotation.x=-Math.PI/2; scene.add(sea);
const bedGeo=new THREE.PlaneGeometry(110,110,70,70); const pos=bedGeo.attributes.position; for(let i=0;i<pos.count;i++){const x=pos.getX(i), y=pos.getY(i); const z=Math.sin(x*.18)*.18 + Math.cos(y*.15)*.12 + (Math.random()-.5)*.04; pos.setZ(i,z);} bedGeo.computeVertexNormals(); const seabed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({color:0x8c7a55,roughness:1,metalness:0})); seabed.rotation.x=-Math.PI/2; scene.add(seabed);
const seaLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-45,0,0),new THREE.Vector3(45,0,0)]), new THREE.LineBasicMaterial({color:0x8be7ff})); scene.add(seaLine);
const bedLineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-45,-4,0),new THREE.Vector3(45,-4,0)]);
const bedLine = new THREE.Line(bedLineGeom, new THREE.LineBasicMaterial({color:0xe2c998})); scene.add(bedLine);
function updateSeabedVisuals(){const d=state().d; seabed.position.y=-d; const arr=bedLine.geometry.attributes.position.array; arr[1]=-d; arr[4]=-d; bedLine.geometry.attributes.position.needsUpdate=true; if(underShadow) underShadow.position.y=-d+0.02;}
scene.add(new THREE.GridHelper(70,28,0x244f67,0x143648));
let mountain, cap, station, underShadow;
function rebuild(){
  if(mountain) scene.remove(mountain); if(cap) scene.remove(cap); if(station) scene.remove(station); if(underShadow) scene.remove(underShadow);
  const {b,t,h,d}=state();
  mountain = new THREE.Mesh(new THREE.CylinderGeometry(t/2,b/2,h,4,1,false), new THREE.MeshStandardMaterial({color:0x6e7873,roughness:.92}));
  mountain.rotation.y=Math.PI/4; mountain.position.y=-d+h/2; scene.add(mountain);
  const capY = -d+h/2 + h/2;
  cap = new THREE.Mesh(new THREE.CylinderGeometry(t/2,t/2,.2,4), new THREE.MeshStandardMaterial({color:0x96a39d,roughness:.8}));
  cap.rotation.y=Math.PI/4; cap.position.y=capY+.1; scene.add(cap);
  station = new THREE.Group(); station.position.set(0,capY+.32,0); const platform = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.9,t*.82),.18,Math.max(.9,t*.82)), new THREE.MeshStandardMaterial({color:0xe0eef5})); station.add(platform); const mast=new THREE.Mesh(new THREE.CylinderGeometry(.03,.04,.82,8),new THREE.MeshStandardMaterial({color:0xffffff})); mast.position.y=.52; station.add(mast); scene.add(station);
  underShadow = new THREE.Mesh(new THREE.CircleGeometry(Math.max(1.5,b*.42),32), new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.18})); underShadow.rotation.x=-Math.PI/2; underShadow.position.y=-7.98; scene.add(underShadow);
}
const flow=[], iceFloes=[], packFloes=[];
const flowMat=new THREE.MeshBasicMaterial({color:0x5fe2ff}); const iceMat=new THREE.MeshStandardMaterial({color:0xeafcff,transparent:true,opacity:.95});
function resetObj(p,isIce){const d=state().d; p.position.set(-28,isIce?0.16:(-d+0.4+Math.random()*Math.max(0.6,d-0.8)),(Math.random()-.5)*32)}
for(let n=0;n<160;n++){const p=new THREE.Mesh(new THREE.SphereGeometry(.05,6,6),flowMat); resetObj(p,false); scene.add(p); flow.push(p)}
for(let n=0;n<54;n++){const s=.38+Math.random()*.95; const p=new THREE.Mesh(new THREE.CylinderGeometry(s,s*.8,.08,8),iceMat); p.userData.baseScale=s; resetObj(p,true); scene.add(p); iceFloes.push(p)}
function resetPack(p){p.position.set(-36-Math.random()*10,0.16,(Math.random()-.5)*30)}
const classOrder=["big","big","medium","vast","big","vast","big","medium","giant","vast","big","giant"];
for(let n=0;n<12;n++){
  const p=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.12,18), new THREE.MeshStandardMaterial({color:0xf5fdff,transparent:true,opacity:.93}));
  p.userData.kind=classOrder[n];
  p.userData.seed=Math.random();
  p.rotation.y=Math.random()*Math.PI;
  resetPack(p);
  scene.add(p);
  packFloes.push(p);
}
function move(dt){const {b,v,ice}=state(); const waterSpeed=v*20, iceSpeed=ice*6, waterDeflect=b*.68, iceDeflect=b*.92;
 for(const p of flow){const rr=Math.hypot(p.position.x,p.position.z*1.1); if(rr<waterDeflect && p.position.x<3){p.position.z += Math.sign(p.position.z||1)*(waterDeflect-rr)*.95*dt;} p.position.x += waterSpeed*dt; if(p.position.x>28) resetObj(p,false)}
 for(const p of iceFloes){const rr=Math.hypot(p.position.x,p.position.z*1.05); if(rr<iceDeflect && p.position.x<3){p.position.z += Math.sign(p.position.z||1)*(iceDeflect-rr)*1.15*dt; p.position.y = 0.16 + Math.max(0,(iceDeflect-rr))*0.018;} else {p.position.y += (0.16-p.position.y)*0.08;} p.position.x += iceSpeed*dt; p.rotation.y += dt*.16; if(p.position.x>28) resetObj(p,true)}
 for(const p of packFloes){const rr=Math.hypot(p.position.x,p.position.z*1.02); if(rr<iceDeflect*1.05 && p.position.x<4){p.position.z += Math.sign(p.position.z||1)*(iceDeflect*1.05-rr)*0.75*dt; p.position.y = 0.18 + Math.max(0,(iceDeflect*1.05-rr))*0.014;} else {p.position.y += (0.16-p.position.y)*0.05;} p.position.x += iceSpeed*0.72*dt; p.rotation.y += dt*0.05; if(p.position.x>28) resetPack(p)}
}
function updateSweep(){const t=+$('t').value, rows=[8,12,16,20,24].map(b=>{const h=8,d=4,bw=b+(t-b)*(d/h),V=h/3*(b*b+b*t+t*t),Vs=d/3*(b*b+b*bw+bw*bw),eff=(2700*V-1025*Vs)*1e9,P=eff*9.81/(b*b*1e6)/1e6,slope=Math.atan(h/((b-t)/2))*180/Math.PI; return {b,V,P,slope};});
 $('sweepTable').innerHTML=`<table><thead><tr><th>Podstawa</th><th>Objętość</th><th>Nacisk</th><th>Kąt</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.b} km</td><td>${fmt(r.V,0)} km³</td><td>${fmt(r.P,1)} MPa</td><td>${fmt(r.slope,1)}°</td></tr>`).join('')}</tbody></table>`;
 const first=rows[0], last=rows[rows.length-1]; $('sweepInsight').innerHTML=`Wniosek: szersza podstawa mocno łagodzi zbocze, ale przeciętny nacisk spada słabo. ${first.b}→${last.b} km daje spadek kąta z <b>${fmt(first.slope,1)}°</b> do <b>${fmt(last.slope,1)}°</b>, ale nacisk tylko z <b>${fmt(first.P,1)}</b> do <b>${fmt(last.P,1)} MPa</b>.`;
 $('tradeBars').innerHTML=rows.map(r=>`<div class="minirow"><div>${r.b} km: ${fmt(r.V,0)} km³ • ${fmt(r.slope,1)}°</div><div>${fmt((r.V/rows[0].V)*100,0)}%</div></div><div class="bar"><i style="width:${Math.min(100,(r.V/rows[rows.length-1].V)*100)}%"></i></div>`).join('');
 $('tradeInsight').innerHTML=`Przy obecnym szczycie <b>${fmt(t,1)} km</b> łagodzenie zbocza szybko podnosi ilość wymaganej skały. To sygnał, że trzeba testować tarasowanie albo inną geometrię.`;
}
function updateDiagramIce(){
 const wrap=$('iceFloes2'); wrap.innerHTML='';
 const s=state();
 const volumeFactor=(s.iceFront*s.iceLen*s.iceThick*(s.iceConc/100))/320;
 const n=Math.max(8, Math.min(42, Math.round(8 + volumeFactor*5)));
 const pile=Math.min(2.2,(s.ice*s.iceThick*(s.iceConc/100))/0.2);
 for(let i=0;i<n;i++){
   const el=document.createElement('i');
   const size=14+Math.random()*18 + pile*8 + Math.min(18, volumeFactor*2.2);
   const clusterBias=Math.min(.62, volumeFactor/12);
   const xBase=(i/n)*58;
   const x=3 + Math.min(62, xBase*(1-clusterBias) + Math.random()*5);
   const y=15 + Math.sin(i*.7)*16 + Math.random()*12;
   el.style.width=size+'px';
   el.style.height=(size*0.48)+'px';
   el.style.left=x+'%';
   el.style.top=y+'%';
   el.style.opacity=(0.76 + Math.min(.22, volumeFactor/20)).toFixed(2);
   wrap.appendChild(el);
 }
}
function updateIceVisuals3D(){
 const s=state();
 const profile=getIceProfile(s), mix=profile.mix;
 const smallScale=0.75 + Math.min(1.8,(s.iceThick/2) * (0.55 + s.iceConc/100));
 const smallFraction=Math.max(0.16, Math.min(1, (s.iceFront/20)*(0.45+s.iceLen/24)*(s.iceConc/85)/2.2));
 const smallTarget=Math.round(iceFloes.length * smallFraction * (mix.small + mix.medium + mix.big*0.35));
 for(let i=0;i<iceFloes.length;i++){
   const p=iceFloes[i];
   p.visible = i < smallTarget;
   p.scale.setScalar(smallScale*(0.9 + (p.userData.baseScale||1)*0.22));
   if(p.visible){ p.position.y = Math.max(0.16, p.position.y); }
 }
 const packVisible=Math.max(2, Math.min(packFloes.length, Math.round(2 + (s.iceFront/80)*4 + (s.iceLen/60)*3 + (s.iceConc/100)*3)));
 const giantBoost = mix.giant*10, vastBoost = mix.vast*6, bigBoost = mix.big*4;
 for(let i=0;i<packFloes.length;i++){
   const p=packFloes[i];
   p.visible = i < packVisible;
   let baseX=3, baseZ=2;
   if(p.userData.kind==='medium'){ baseX=2.2; baseZ=1.4; }
   if(p.userData.kind==='big'){ baseX=4.2 + bigBoost; baseZ=2.6 + bigBoost*0.45; }
   if(p.userData.kind==='vast'){ baseX=7.5 + vastBoost; baseZ=4.6 + vastBoost*0.6; }
   if(p.userData.kind==='giant'){ baseX=11.5 + giantBoost; baseZ=6.5 + giantBoost*0.8; }
   const fieldMul = 0.8 + (s.iceFront/40)*0.4 + (s.iceLen/20)*0.25;
   const thickMul = 0.85 + (s.iceThick/4)*0.45;
   p.scale.set(baseX*fieldMul, 1 + s.iceThick*0.08, baseZ*thickMul);
 }
}
function updateAll(){
 const s=state(), g=geom(s);
 $('bo').textContent=fmt(s.b,1)+' km'; $('to').textContent=fmt(s.t,1)+' km'; $('ho').textContent=fmt(s.h,2)+' km'; $('do').textContent=fmt(s.d,2)+' km'; $('vo').textContent=fmt(s.v,3)+' m/s'; $('io').textContent=fmt(s.ice,2)+' m/s';
 const above=Math.max(0,s.h-s.d), below=Math.min(s.h,s.d);
 $('aboveLbl').textContent=fmt(above,1)+' km'; $('belowLbl').textContent=fmt(below,1)+' km'; $('aboveKpi').textContent=fmt(above,1)+' km'; $('belowKpi').textContent=fmt(below,1)+' km'; $('markAbove').textContent='+'+fmt(above,1)+' km'; $('markBelow').textContent='−'+fmt(below,1)+' km'; updateSeabedVisuals();
 $('vol').textContent=fmt(g.V,1)+' km³'; $('mass').textContent=(g.mass/1e14).toFixed(2)+'×10¹⁴ kg'; $('press').textContent=fmt(g.P,1)+' MPa'; $('slope').textContent=fmt(g.slope,1)+'°'; const profile=getIceProfile(s); $('domFloe').textContent=profile.dominant; $('floeMix').textContent=mixText(profile.mix); $('fieldAreaCard').textContent=fmt((s.iceFront*s.iceLen*(s.iceConc/100)),2)+' km²'; $('iceScenario').textContent=profile.name;
 const target=+$('angleTarget').value; $('angleO').textContent=target+'°'; const needBase=s.t + 2*(s.h/Math.tan(target*Math.PI/180)); $('angleBase').textContent=fmt(needBase,1)+' km × '+fmt(needBase,1)+' km';
 const exc=+$('excD').value; $('excO').textContent=fmt(exc,0)+' km'; const excDepth=g.V/(Math.PI*(exc/2)**2)*1000; $('excDepth').textContent=fmt(excDepth,0)+' m'; const excDiam=[8,20,40,80,120,160]; $('excBars').innerHTML=excDiam.map(d=>{const dep=g.V/(Math.PI*(d/2)**2)*1000; const pct=Math.min(100,dep/4000*100); return `<div class="minirow"><div>${d} km średnicy</div><div>${fmt(dep,2)} m</div></div><div class="bar"><i style="width:${pct}%"></i></div>`}).join('');
 $('dragNow').textContent=g.drag>1e9?fmt(g.drag/1e9,2)+' GN':fmt(g.drag/1e6,0)+' MN'; const drags=[0.01,0.02,0.05,0.10,0.20].map(v=>{const A=s.d*1e3*((s.b+g.bw)/2*1e3), F=.5*1025*1.2*A*v*v; return {v,F};}); const maxDrag=drags[drags.length-1].F; $('dragBars').innerHTML=drags.map(x=>`<div class="minirow"><div>${x.v.toFixed(2)} m/s</div><div>${x.F>1e9?fmt(x.F/1e9,2)+' GN':fmt(x.F/1e6,0)+' MN'}</div></div><div class="bar"><i style="width:${(x.F/maxDrag)*100}%"></i></div>`).join('');
 $('iceIndex').textContent=fmt(g.iceIndex,2)+'×'; const iceVals=[0.04,0.08,0.16,0.25,0.40].map(v=>({v,idx:(s.b*v*v)/(8*0.08*0.08)})); const maxIce=iceVals[iceVals.length-1].idx; $('iceBars').innerHTML=iceVals.map(x=>`<div class="minirow"><div>${fmt(x.v,2)} m/s</div><div>${fmt(x.idx,2)}×</div></div><div class="bar"><i style="width:${(x.idx/maxIce)*100}%"></i></div>`).join('');
 const fail=+$('failP').value; $('failO').textContent=fmt(fail,1)+'%'; const failV=g.V*fail/100; $('failV').textContent=fmt(failV,3)+' km³'; const wave=Math.sqrt(9.81*s.d*1000); $('waveSpeed').textContent=fmt(wave,0)+' m/s ≈ '+fmt(wave*3.6,0)+' km/h';
 $('subV').textContent=fmt(g.Vs,2)+' km³'; $('msl').textContent=fmt((g.Vs/361e6)*1e6,3)+' mm';
 $('iceThickO').textContent=fmt(s.iceThick,1)+' m'; $('iceFrontO').textContent=fmt(s.iceFront,0)+' km'; $('iceConcO').textContent=fmt(s.iceConc,0)+'%'; const iceArea=s.iceFront*1000*s.b*1000*(s.iceConc/100); const pile=(s.iceFront*s.iceThick*(s.iceConc/100)*s.ice)/(20*2*0.8*0.08); $('iceArea').textContent=fmt(iceArea/1e6,2)+' km²'; $('icePile').textContent=fmt(pile,2)+'×'; $('icePileRisk').textContent=pile<0.8?'niskie':pile<1.5?'umiarkowane':pile<3?'wysokie':'bardzo wysokie';
 $('iceLenO').textContent=fmt(s.iceLen,0)+' km'; $('iceRhoO').textContent=fmt(s.iceRho,0)+' kg/m³'; const width=Math.min(s.iceFront,s.b*2); const volImpact=width*1000*s.iceLen*1000*s.iceThick*(s.iceConc/100); const massImpact=volImpact*s.iceRho; const momentum=massImpact*s.ice; const energy=.5*massImpact*s.ice*s.ice; $('iceVolImpact').textContent=fmt(volImpact/1e6,2)+' mln m³'; $('iceMassImpact').textContent=(massImpact/1e9).toFixed(2)+'×10⁹ kg'; $('iceMomentum').textContent=(momentum/1e9).toFixed(2)+'×10⁹ kg·m/s'; $('iceEnergy').textContent=(energy/1e9).toFixed(2)+' GJ'; const impactIndex=(massImpact/1e9)*(s.ice/0.08); $('iceImpactRisk').textContent=impactIndex<20?'niski':impactIndex<80?'umiarkowany':impactIndex<200?'wysoki':'ekstremalny';
 updateSweep(); updateDiagramIce(); updateIceVisuals3D();
}
['b','t','h','d','v','ice','angleTarget','excD','failP','iceThick','iceFront','iceConc','iceLen','iceRho'].forEach(id=>$(id).addEventListener('input',()=>{updateAll(); if(['b','t','h','d'].includes(id)) rebuild();}));
function applyPreset(kind){
 if(kind==='summer'){ $('iceThick').value=1.0; $('iceFront').value=18; $('iceConc').value=55; $('iceLen').value=6; $('ice').value=.12; $('iceRho').value=880; }
 if(kind==='winter'){ $('iceThick').value=2.2; $('iceFront').value=28; $('iceConc').value=88; $('iceLen').value=10; $('ice').value=.08; $('iceRho').value=900; }
 if(kind==='multi'){ $('iceThick').value=3.4; $('iceFront').value=36; $('iceConc').value=95; $('iceLen').value=14; $('ice').value=.06; $('iceRho').value=910; }
 updateAll();
}
$('presetSummer').addEventListener('click',()=>applyPreset('summer'));
$('presetWinter').addEventListener('click',()=>applyPreset('winter'));
$('presetMulti').addEventListener('click',()=>applyPreset('multi'));
$('reset').addEventListener('click',()=>{Object.assign($('b'),{value:8}); Object.assign($('t'),{value:2.0}); Object.assign($('h'),{value:8}); Object.assign($('d'),{value:4}); Object.assign($('v'),{value:.09}); Object.assign($('ice'),{value:.25}); Object.assign($('iceThick'),{value:2}); Object.assign($('iceFront'),{value:20}); Object.assign($('iceConc'),{value:80}); Object.assign($('iceLen'),{value:10}); Object.assign($('iceRho'),{value:900}); updateAll(); rebuild();});
function resize(){renderer.setSize(viewer.clientWidth,viewer.clientHeight,false); camera.aspect=viewer.clientWidth/viewer.clientHeight; camera.updateProjectionMatrix()} addEventListener('resize',resize); resize(); rebuild(); updateAll(); updateSeabedVisuals();
let last=performance.now(); function loop(now){const dt=Math.min((now-last)/1000,.05); last=now; move(dt); controls.update(); renderer.render(scene,camera); requestAnimationFrame(loop)} requestAnimationFrame(loop);
