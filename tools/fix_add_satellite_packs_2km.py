from __future__ import annotations

import json, os, shutil, zipfile
from datetime import datetime
from pathlib import Path

import numpy as np
import pystac_client
import rasterio
import requests
from PIL import Image
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject

LAT, LON = 53.594070, 19.000151
YEARS = [2000, 2005, 2010, 2015, 2020, 2026]
ROOT = Path('satellite_packs/53.594070_19.000151')
ROOT.mkdir(parents=True, exist_ok=True)
TARGET_CRS='EPSG:32634'; HALF=1000.0
tr=Transformer.from_crs('EPSG:4326',TARGET_CRS,always_xy=True); cx,cy=tr.transform(LON,LAT)
BOUNDS=(cx-HALF,cy-HALF,cx+HALF,cy+HALF); BBOX=[LON-0.04,LAT-0.03,LON+0.04,LAT+0.03]
PC='https://planetarycomputer.microsoft.com/api/stac/v1'
INPE='https://data.inpe.br/bdc/stac/v1/'
S=requests.Session(); TOKENS={}
os.environ['GDAL_DISABLE_READDIR_ON_OPEN']='EMPTY_DIR';os.environ['GDAL_HTTP_MULTIRANGE']='YES';os.environ['GDAL_HTTP_MERGE_CONSECUTIVE_RANGES']='YES'

def grid(res):
    n=max(1,round(2000/res)); return n,from_bounds(*BOUNDS,width=n,height=n)

def token(cid):
    if cid not in TOKENS:
        r=S.get(f'https://planetarycomputer.microsoft.com/api/sas/v1/token/{cid}',timeout=60);r.raise_for_status();TOKENS[cid]=r.json()['token']
    return TOKENS[cid]

def key(item,names):
    for n in names:
        if n in item.assets:return n
    low={k.lower():k for k in item.assets}
    for n in names:
        if n.lower() in low:return low[n.lower()]
    for k,a in item.assets.items():
        for b in a.extra_fields.get('eo:bands',[]) or []:
            if str(b.get('common_name','')).lower() in [x.lower() for x in names]:return k
    for k in item.assets:
        kk=k.lower().replace('_','').replace('-','')
        if any(n.lower().replace('_','').replace('-','') in kk for n in names):return k
    return None

def href(item,k,pc=True):
    h=item.assets[k].href
    if pc and '?' not in h:h += '?' + token(item.collection_id)
    return h

def read(item,k,res,pc=True,band=1,nearest=False):
    n,t=grid(res); out=np.full((n,n),np.nan,np.float32)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_MULTIRANGE='YES'):
        with rasterio.open(href(item,k,pc)) as src:
            reproject(rasterio.band(src,band),out,src_transform=src.transform,src_crs=src.crs,src_nodata=src.nodata,dst_transform=t,dst_crs=TARGET_CRS,dst_nodata=np.nan,resampling=Resampling.nearest if nearest else Resampling.bilinear)
    return out

def stretch(a,a0=2,a1=98):
    v=np.isfinite(a);o=np.zeros(a.shape,np.float32)
    if not v.any():return o
    lo,hi=np.percentile(a[v],[a0,a1]);hi=max(hi,lo+1e-6);o[v]=np.clip((a[v]-lo)/(hi-lo),0,1);return o

def rgb(ch,p):
    x=np.stack([stretch(a) for a in ch],-1);Image.fromarray(np.rint(np.clip(x,0,1)**0.95*255).astype(np.uint8),'RGB').save(p,optimize=True)

def gray(a,p,log=False):
    x=a.copy()
    if log:
        v=np.isfinite(x)&(x>0);x[v]=10*np.log10(x[v]);x[~v]=np.nan
    Image.fromarray(np.rint(stretch(x,1,99)*255).astype(np.uint8),'L').save(p,optimize=True)

def date(i):return str(i.properties.get('datetime') or i.properties.get('start_datetime') or '')[:10]
def cloud(i):
    try:return float(i.properties.get('eo:cloud_cover',100))
    except:return 100

def ranked(items,y):
    def s(i):
        try:d=abs((datetime.fromisoformat(date(i))-datetime(y,7,15)).days)
        except:d=999
        return cloud(i)*10+d
    return sorted(items,key=s)

def pc_search(cid,y,platform=None):
    cat=pystac_client.Client.open(PC);items=list(cat.search(collections=[cid],bbox=BBOX,datetime=f'{y}-01-01/{y}-12-31',limit=100).items())
    if platform:items=[i for i in items if str(i.properties.get('platform','')).lower()==platform.lower()]
    return ranked(items,y)

def choose(items,names,res,pc=True):
    for i in items[:30]:
        k=key(i,names)
        if not k:continue
        try:
            a=read(i,k,res,pc,nearest=True);vf=float(np.mean(np.isfinite(a)))
            print('try',i.id,'date',date(i),'cloud',cloud(i),'vf',vf,flush=True)
            if vf>=.95:return i,vf
        except Exception as e:print('read fail',i.id,repr(e),flush=True)
    return None,0

def zpack(folder,name):
    z=ROOT/name
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as f:
        for p in sorted(folder.rglob('*')):
            if p.is_file():f.write(p,p.relative_to(folder))
    return z

def build_landsat():
    d=ROOT/'USGS_Landsat';shutil.rmtree(d,ignore_errors=True);d.mkdir()
    man={'source':'USGS Landsat Collection 2 Level-2 Surface Reflectance via Microsoft Planetary Computer','center':[LAT,LON],'crop':'2 km x 2 km','years':[],'note':'Real 30 m surface-reflectance pixels, true-color RGB; no AI.'}
    pref={2000:['landsat-7','landsat-5'],2005:['landsat-5','landsat-7'],2010:['landsat-5','landsat-7'],2015:['landsat-8'],2020:['landsat-8'],2026:['landsat-9','landsat-8']}
    for y in YEARS:
        rec={'year':y,'status':'not_found'};i=None;vf=0
        for plat in pref[y]:
            i,vf=choose(pc_search('landsat-c2-l2',y,plat),['red'],30,True)
            if i:break
        if not i:man['years'].append(rec);continue
        rk=key(i,['red']);gk=key(i,['green']);bk=key(i,['blue'])
        if not all([rk,gk,bk]):rec.update(status='missing_rgb',assets=list(i.assets));man['years'].append(rec);continue
        rr=read(i,rk,30);gg=read(i,gk,30);bb=read(i,bk,30);dt=date(i);plat=i.properties.get('platform','landsat')
        p=d/f'{y}_{dt}_{plat}_USGS_Landsat_C2_L2_RGB30m_2km.png';rgb([rr,gg,bb],p)
        rec.update(status='ok',date=dt,platform=plat,item_id=i.id,cloud=cloud(i),valid_fraction=round(vf,6),files=[p.name]);man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');zpack(d,'USGS_Landsat_2km.zip')

def find_pc_collection(exact,terms):
    cat=pystac_client.Client.open(PC)
    try:
        if cat.get_collection(exact):return exact
    except:pass
    for c in cat.get_collections():
        t=(c.id+' '+(c.title or '')+' '+(c.description or '')).lower()
        if all(x.lower() in t for x in terms):return c.id
    return None

def build_alos():
    d=ROOT/'JAXA_ALOS_PALSAR';shutil.rmtree(d,ignore_errors=True);d.mkdir()
    cid=find_pc_collection('alos-palsar-mosaic',['alos','palsar','mosaic'])
    man={'source':'JAXA ALOS/ALOS-2 PALSAR Annual Mosaic via Microsoft Planetary Computer','collection':cid,'center':[LAT,LON],'crop':'2 km x 2 km','years':[],'note':'Real SAR radar pixels, normally 25 m. Water often appears dark. Not optical photography.'}
    if cid:
        for y in YEARS:
            rec={'year':y,'status':'not_found'}
            try:items=pc_search(cid,y)
            except Exception as e:rec['error']=repr(e);man['years'].append(rec);continue
            i,vf=choose(items,['hh','HH'],25,True)
            if not i:man['years'].append(rec);continue
            hk=key(i,['hh','HH']);vk=key(i,['hv','HV']);hha=read(i,hk,25,True,nearest=True);dt=date(i)
            pg=d/f'{y}_{dt or y}_JAXA_ALOS_PALSAR_HH25m_2km.png';gray(hha,pg,True);files=[pg.name]
            if vk:
                hva=read(i,vk,25,True,nearest=True);sh=stretch(np.where(hha>0,10*np.log10(hha),np.nan),1,99);sv=stretch(np.where(hva>0,10*np.log10(hva),np.nan),1,99);comp=np.stack([sh,sv,np.clip(sh-sv+.5,0,1)],-1)
                pr=d/f'{y}_{dt or y}_JAXA_ALOS_PALSAR_HH_HV25m_2km.png';Image.fromarray(np.rint(comp*255).astype(np.uint8),'RGB').save(pr,optimize=True);files.append(pr.name)
            rec.update(status='ok',date=dt,item_id=i.id,valid_fraction=round(vf,6),files=files);man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');zpack(d,'JAXA_ALOS_PALSAR_2km.zip')

def inpe_catalog():return pystac_client.Client.open(INPE)
def inpe_collection_by_title(terms):
    for c in inpe_catalog().get_collections():
        t=(c.id+' '+(c.title or '')+' '+(c.description or '')).lower()
        if all(x.lower() in t for x in terms):return c.id
    return None

def inpe_items(cid,y):
    if not cid:return []
    try:return ranked(list(inpe_catalog().search(collections=[cid],bbox=BBOX,datetime=f'{y}-01-01/{y}-12-31',limit=100).items()),y)
    except Exception as e:print('INPE search fail',cid,y,repr(e),flush=True);return []
def build_cbers():
    d=ROOT/'INPE_CBERS_China_Brazil';shutil.rmtree(d,ignore_errors=True);d.mkdir()
    c2=inpe_collection_by_title(['cbers-2/ccd','level-2'])
    c2b=inpe_collection_by_title(['cbers-2b/ccd','level-2'])
    c4pan=inpe_collection_by_title(['cbers-4/pan5m','level-4']) or inpe_collection_by_title(['cbers-4/pan5m','level-2'])
    c4afused=inpe_collection_by_title(['cbers-4a/wpm','fusion']) or inpe_collection_by_title(['cbers-4a/wpm','fused'])
    man={'source':'INPE official STAC — CBERS China-Brazil Earth Resources Satellite','center':[LAT,LON],'crop':'2 km x 2 km','collections':{'CBERS2_CCD':c2,'CBERS2B_CCD':c2b,'CBERS4_PAN5M':c4pan,'CBERS4A_WPM_FUSED':c4afused},'years':[],'note':'Included only if official INPE catalogue contains a scene covering the Poland coordinate. No substitution or fabricated image.'}
    for y in YEARS:
        rec={'year':y,'status':'not_found'};candidates=[]
        if y==2005 and c2:candidates.append((c2,20,['BAND3','red'],20,'rgb_ccd'))
        if y==2010 and c2b:candidates.append((c2b,20,['BAND3','red'],20,'rgb_ccd'))
        if y in [2015,2020,2026] and c4pan:candidates.append((c4pan,5,['BAND1','pan'],5,'pan'))
        if y==2026 and c4afused:candidates.insert(0,(c4afused,2,['tci'],2,'tci'))
        chosen=None
        for cid,res,test,res2,kind in candidates:
            items=inpe_items(cid,y);i,vf=choose(items,test,res,False)
            if i:chosen=(cid,res,kind,i,vf);break
        if not chosen:man['years'].append(rec);continue
        cid,res,kind,i,vf=chosen;dt=date(i);files=[]
        if kind=='tci':
            tk=key(i,['tci']);
            try:r=read(i,tk,res,False,1);g=read(i,tk,res,False,2);b=read(i,tk,res,False,3);p=d/f'{y}_{dt}_CBERS4A_WPM_fused_RGB2m_2km.png';rgb([r,g,b],p);files=[p.name]
            except Exception as e:rec['render_error']=repr(e)
        elif kind=='pan':
            pk=key(i,['BAND1','pan']);a=read(i,pk,res,False,1);p=d/f'{y}_{dt}_CBERS4_PAN5M_5m_2km.png';gray(a,p);files=[p.name]
        else:
            rk=key(i,['BAND3','red']);gk=key(i,['BAND2','green']);bk=key(i,['BAND1','blue'])
            if all([rk,gk,bk]):r=read(i,rk,res,False);g=read(i,gk,res,False);b=read(i,bk,res,False);p=d/f'{y}_{dt}_CBERS_CCD_RGB20m_2km.png';rgb([r,g,b],p);files=[p.name]
        if files:rec.update(status='ok',date=dt,collection=cid,item_id=i.id,resolution_m=res,valid_fraction=round(vf,6),files=files)
        man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');zpack(d,'INPE_CBERS_China_Brazil_2km.zip')

def rebuild_all():
    z=ROOT/'ALL_SATELLITES_2km.zip'
    if z.exists():z.unlink()
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as f:
        for p in sorted(ROOT.rglob('*')):
            if p.is_file() and p!=z and not p.name.endswith('.zip'):f.write(p,p.relative_to(ROOT))

if __name__=='__main__':
    for name,fn in [('Landsat',build_landsat),('JAXA ALOS PALSAR',build_alos),('INPE CBERS',build_cbers)]:
        print('\n===',name,'===',flush=True)
        try:fn()
        except Exception as e:print('FAILED',name,repr(e),flush=True)
    rebuild_all()
    for p in sorted(ROOT.rglob('*')):
        if p.is_file():print(p,p.stat().st_size,flush=True)
