from __future__ import annotations

import json, os, re, shutil, zipfile
from datetime import datetime
from pathlib import Path
import numpy as np
import pystac_client, rasterio, requests
from PIL import Image
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject

LAT,LON=53.594070,19.000151
ROOT=Path('satellite_packs/53.594070_19.000151');ROOT.mkdir(parents=True,exist_ok=True)
TARGET='EPSG:32634';tr=Transformer.from_crs('EPSG:4326',TARGET,always_xy=True);cx,cy=tr.transform(LON,LAT)
BOUNDS=(cx-1000,cy-1000,cx+1000,cy+1000);BBOX=[LON-.04,LAT-.03,LON+.04,LAT+.03]
PC='https://planetarycomputer.microsoft.com/api/stac/v1';USGS='https://landsatlook.usgs.gov/stac-server'
S=requests.Session();TOK={}
os.environ['GDAL_DISABLE_READDIR_ON_OPEN']='EMPTY_DIR';os.environ['GDAL_HTTP_MULTIRANGE']='YES'

def grid(res):
    n=round(2000/res);return n,from_bounds(*BOUNDS,width=n,height=n)
def token(cid):
    if cid not in TOK:
        r=S.get(f'https://planetarycomputer.microsoft.com/api/sas/v1/token/{cid}',timeout=60);r.raise_for_status();TOK[cid]=r.json()['token']
    return TOK[cid]
def key(i,names):
    for n in names:
        if n in i.assets:return n
    low={k.lower():k for k in i.assets}
    for n in names:
        if n.lower() in low:return low[n.lower()]
    for k,a in i.assets.items():
        for b in a.extra_fields.get('eo:bands',[]) or []:
            if str(b.get('common_name','')).lower() in [x.lower() for x in names]:return k
    for k in i.assets:
        kk=k.lower().replace('_','').replace('-','')
        if any(x.lower().replace('_','').replace('-','') in kk for x in names):return k
    return None
def href(i,k,sign=False):
    h=i.assets[k].href
    if sign and '?' not in h:h+='?'+token(i.collection_id)
    return h
def read(i,k,res,band=1,sign=False,nearest=False):
    n,t=grid(res);o=np.full((n,n),np.nan,np.float32)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_MULTIRANGE='YES'):
        with rasterio.open(href(i,k,sign)) as src:
            reproject(rasterio.band(src,band),o,src_transform=src.transform,src_crs=src.crs,src_nodata=src.nodata,dst_transform=t,dst_crs=TARGET,dst_nodata=np.nan,resampling=Resampling.nearest if nearest else Resampling.bilinear)
    return o
def stretch(a,p0=2,p1=98):
    v=np.isfinite(a);o=np.zeros(a.shape,np.float32)
    if not v.any():return o
    lo,hi=np.percentile(a[v],[p0,p1]);hi=max(hi,lo+1e-6);o[v]=np.clip((a[v]-lo)/(hi-lo),0,1);return o
def save_gray(a,p,log=False):
    x=a.copy()
    if log:
        v=np.isfinite(x)&(x>0);x[v]=10*np.log10(x[v]);x[~v]=np.nan
    Image.fromarray(np.rint(stretch(x,1,99)*255).astype(np.uint8),'L').save(p,optimize=True)
def cloud(i):
    try:return float(i.properties.get('eo:cloud_cover',i.properties.get('landsat:cloud_cover_land',100)))
    except:return 100
def dte(i):return str(i.properties.get('datetime') or i.properties.get('start_datetime') or '')[:10]
def rank(items,y):
    def s(i):
        try:dd=abs((datetime.fromisoformat(dte(i))-datetime(y,7,15)).days)
        except:dd=999
        return cloud(i)*10+dd
    return sorted(items,key=s)
def zpack(d,name):
    z=ROOT/name
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as f:
        for p in sorted(d.rglob('*')):
            if p.is_file():f.write(p,p.relative_to(d))

def build_usgs_pan():
    d=ROOT/'USGS_Landsat_Level1_PAN15m';shutil.rmtree(d,ignore_errors=True);d.mkdir()
    man={'source':'USGS EROS Landsat Collection 2 Level-1 STAC','center':[LAT,LON],'crop':'2 km x 2 km','years':[],'note':'15 m panchromatic pixels where sensor provides Band 8. Color pansharpened view combines real 30 m RGB with real 15 m PAN; deterministic processing, no AI.'}
    cat=pystac_client.Client.open(USGS)
    prefs={2000:'landsat-7',2015:'landsat-8',2020:'landsat-8',2026:'landsat-9'}
    for y,plat in prefs.items():
        rec={'year':y,'status':'not_found'}
        try:items=list(cat.search(collections=['landsat-c2l1'],bbox=BBOX,datetime=f'{y}-01-01/{y}-12-31',limit=100).items())
        except Exception as e:rec['search_error']=repr(e);man['years'].append(rec);continue
        items=[i for i in items if str(i.properties.get('platform','')).lower()==plat]
        chosen=None;vf=0
        for i in rank(items,y)[:20]:
            pk=key(i,['pan','panchromatic','B8','band8'])
            if not pk:continue
            try:
                p=read(i,pk,15,sign=False,nearest=True);v=float(np.mean(np.isfinite(p)))
                print('USGS PAN',y,i.id,pk,v,cloud(i),flush=True)
                if v>=.95:chosen=i;vf=v;break
            except Exception as e:print('PAN fail',i.id,repr(e),flush=True)
        if not chosen:man['years'].append(rec);continue
        pk=key(chosen,['pan','panchromatic','B8','band8']);rk=key(chosen,['red','B4','B3']);gk=key(chosen,['green','B3','B2']);bk=key(chosen,['blue','B2','B1'])
        pan=read(chosen,pk,15);dt=dte(chosen);base=f'{y}_{dt}_{plat}'
        pp=d/f'{base}_PAN15m_2km.png';save_gray(pan,pp);files=[pp.name]
        if all([rk,gk,bk]):
            try:
                r=read(chosen,rk,15);g=read(chosen,gk,15);b=read(chosen,bk,15);sr,sg,sb,sp=map(stretch,[r,g,b,pan]);inten=(sr+sg+sb)/3+1e-4;q=sp/inten;out=np.stack([np.clip(sr*q,0,1),np.clip(sg*q,0,1),np.clip(sb*q,0,1)],-1);pc=d/f'{base}_RGB_PANSHARP15m_2km.png';Image.fromarray(np.rint(out*255).astype(np.uint8),'RGB').save(pc,optimize=True);files.append(pc.name)
            except Exception as e:rec['pansharp_error']=repr(e)
        rec.update(status='ok',date=dt,item_id=chosen.id,cloud=cloud(chosen),valid_fraction=round(vf,6),files=files);man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');zpack(d,'USGS_Landsat_Level1_PAN15m_2km.zip')

def parse_year(i):
    vals=[dte(i),str(i.properties.get('start_datetime','')),str(i.properties.get('end_datetime','')),i.id]
    for v in vals:
        m=re.search(r'(20(?:0[6-9]|1\d|2\d))',v)
        if m:return int(m.group(1))
    for k,v in i.properties.items():
        if 'year' in k.lower():
            try:return int(v)
            except:pass
    return None

def build_alos_fallback():
    d=ROOT/'JAXA_ALOS_PALSAR';d.mkdir(exist_ok=True)
    man={'source':'JAXA ALOS/ALOS-2 PALSAR Annual Mosaic via Microsoft Planetary Computer','collection':'alos-palsar-mosaic','center':[LAT,LON],'crop':'2 km x 2 km','years':[],'note':'SAR radar, real annual mosaic pixels. Time selection uses item metadata/ID because annual mosaics may not expose a normal datetime.'}
    cat=pystac_client.Client.open(PC)
    try:items=list(cat.search(collections=['alos-palsar-mosaic'],bbox=BBOX,limit=500).items())
    except Exception as e:man['error']=repr(e);items=[]
    inventory=[]
    for i in items:inventory.append({'id':i.id,'year':parse_year(i),'datetime':dte(i),'assets':list(i.assets)})
    man['inventory_sample']=inventory[:50]
    for y in [2010,2015,2020]:
        rec={'year':y,'status':'not_found'};cand=[i for i in items if parse_year(i)==y]
        for i in cand:
            hk=key(i,['hh','HH'])
            if not hk:continue
            try:
                a=read(i,hk,25,sign=True,nearest=True);vf=float(np.mean(np.isfinite(a)))
                if vf<.95:continue
                dt=dte(i) or str(y);pg=d/f'{y}_{dt}_JAXA_ALOS_PALSAR_HH25m_2km.png';save_gray(a,pg,True);files=[pg.name]
                vk=key(i,['hv','HV'])
                if vk:
                    hv=read(i,vk,25,sign=True,nearest=True);sh=stretch(np.where(a>0,10*np.log10(a),np.nan),1,99);sv=stretch(np.where(hv>0,10*np.log10(hv),np.nan),1,99);comp=np.stack([sh,sv,np.clip(sh-sv+.5,0,1)],-1);pr=d/f'{y}_{dt}_JAXA_ALOS_PALSAR_HH_HV25m_2km.png';Image.fromarray(np.rint(comp*255).astype(np.uint8),'RGB').save(pr,optimize=True);files.append(pr.name)
                rec.update(status='ok',date=dt,item_id=i.id,valid_fraction=round(vf,6),files=files);break
            except Exception as e:rec['read_error']=repr(e)
        man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');zpack(d,'JAXA_ALOS_PALSAR_2km.zip')

def rebuild_all():
    z=ROOT/'ALL_SATELLITES_2km.zip'
    if z.exists():z.unlink()
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as f:
        for p in sorted(ROOT.rglob('*')):
            if p.is_file() and p!=z and not p.name.endswith('.zip'):f.write(p,p.relative_to(ROOT))

if __name__=='__main__':
    for name,fn in [('USGS PAN15',build_usgs_pan),('ALOS fallback',build_alos_fallback)]:
        print('\n===',name,'===',flush=True)
        try:fn()
        except Exception as e:print('FAILED',name,repr(e),flush=True)
    rebuild_all()
    for p in sorted(ROOT.rglob('*')):
        if p.is_file():print(p,p.stat().st_size,flush=True)
