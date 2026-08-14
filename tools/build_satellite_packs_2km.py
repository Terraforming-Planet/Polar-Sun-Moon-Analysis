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
PC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
TARGET_CRS = 'EPSG:32634'
HALF = 1000.0
tr = Transformer.from_crs('EPSG:4326', TARGET_CRS, always_xy=True)
cx, cy = tr.transform(LON, LAT)
BOUNDS = (cx-HALF, cy-HALF, cx+HALF, cy+HALF)
SEARCH_BBOX = [LON-0.04, LAT-0.03, LON+0.04, LAT+0.03]
S = requests.Session()
TOKENS = {}

os.environ['GDAL_DISABLE_READDIR_ON_OPEN'] = 'EMPTY_DIR'
os.environ['GDAL_HTTP_MULTIRANGE'] = 'YES'
os.environ['GDAL_HTTP_MERGE_CONSECUTIVE_RANGES'] = 'YES'


def catalog():
    return pystac_client.Client.open(PC)


def token(cid):
    if cid not in TOKENS:
        r = S.get(f'https://planetarycomputer.microsoft.com/api/sas/v1/token/{cid}', timeout=60)
        r.raise_for_status(); TOKENS[cid] = r.json()['token']
    return TOKENS[cid]


def signed(item, key):
    href = item.assets[key].href
    return href if '?' in href else href + '?' + token(item.collection_id)


def find_key(item, names):
    for n in names:
        if n in item.assets: return n
    lowers = {k.lower(): k for k in item.assets}
    for n in names:
        if n.lower() in lowers: return lowers[n.lower()]
    for k,a in item.assets.items():
        for b in (a.extra_fields.get('eo:bands') or []):
            common = str(b.get('common_name','')).lower()
            for n in names:
                if common == n.lower(): return k
    for k in item.assets:
        lk = k.lower().replace('_','').replace('-','')
        for n in names:
            nn = n.lower().replace('_','').replace('-','')
            if nn in lk: return k
    return None


def grid(res):
    n = max(1, round(2000/res))
    return n, from_bounds(*BOUNDS, width=n, height=n)


def read_band(item, key, res, band_index=1, nearest=False):
    n, dst_transform = grid(res)
    out = np.full((n,n), np.nan, np.float32)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_MULTIRANGE='YES'):
        with rasterio.open(signed(item,key)) as src:
            reproject(rasterio.band(src, band_index), out,
                src_transform=src.transform, src_crs=src.crs, src_nodata=src.nodata,
                dst_transform=dst_transform, dst_crs=TARGET_CRS, dst_nodata=np.nan,
                resampling=Resampling.nearest if nearest else Resampling.bilinear)
    return out


def stretch(a, p1=2, p2=98):
    valid=np.isfinite(a)
    out=np.zeros(a.shape,np.float32)
    if not valid.any(): return out
    lo,hi=np.percentile(a[valid],[p1,p2])
    if hi<=lo: hi=lo+1
    out[valid]=np.clip((a[valid]-lo)/(hi-lo),0,1)
    return out


def save_rgb(ch, path):
    a=np.stack([stretch(x) for x in ch],axis=-1)
    Image.fromarray(np.rint(np.clip(a,0,1)**0.95*255).astype(np.uint8),'RGB').save(path,optimize=True)


def save_gray(a,path,log=False):
    x=a.astype(np.float32).copy()
    if log:
        ok=np.isfinite(x)&(x>0); x[ok]=10*np.log10(x[ok]); x[~ok]=np.nan
    Image.fromarray(np.rint(stretch(x,1,99)*255).astype(np.uint8),'L').save(path,optimize=True)


def cloud(i):
    try:return float(i.properties.get('eo:cloud_cover',100))
    except:return 100


def date_of(i):
    return str(i.properties.get('datetime') or i.properties.get('start_datetime') or '')[:10]


def search(cid,year,platform=None):
    c=catalog()
    try:
        items=list(c.search(collections=[cid],bbox=SEARCH_BBOX,datetime=f'{year}-01-01/{year}-12-31',limit=100).items())
    except Exception:return []
    if platform:
        items=[i for i in items if str(i.properties.get('platform','')).lower()==platform.lower()]
    def score(i):
        try:d=abs((datetime.fromisoformat(date_of(i))-datetime(year,7,15)).days)
        except:d=999
        return cloud(i)*10+d
    return sorted(items,key=score)


def full_scene(items,testkey,res):
    for i in items[:20]:
        k=find_key(i,testkey)
        if not k: continue
        try:
            a=read_band(i,k,res,nearest=True)
            vf=float(np.mean(np.isfinite(a)))
            print('candidate',i.id,'valid',vf,'cloud',cloud(i),flush=True)
            if vf>=0.95:return i,vf
        except Exception as e: print('candidate failed',i.id,repr(e),flush=True)
    return None,0


def zip_pack(folder,name):
    z=ROOT/name
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as f:
        for p in sorted(folder.rglob('*')):
            if p.is_file():f.write(p,p.relative_to(folder))
    return z


def collection_by_terms(*terms):
    for c in catalog().get_collections():
        text=(c.id+' '+(c.title or '')+' '+(c.description or '')).lower()
        if all(t.lower() in text for t in terms): return c.id
    return None


def landsat_pack():
    d=ROOT/'USGS_Landsat'; shutil.rmtree(d,ignore_errors=True); d.mkdir()
    man={'source':'USGS Landsat Collection 2 Level-1 via Microsoft Planetary Computer','crop':'2 km x 2 km','center':[LAT,LON],'years':[]}
    prefs={2000:['landsat-7'],2005:['landsat-5','landsat-7'],2010:['landsat-5','landsat-7'],2015:['landsat-8'],2020:['landsat-8'],2026:['landsat-9','landsat-8']}
    cid='landsat-c2-l1'
    for y in YEARS:
        rec={'year':y,'status':'not_found'}; chosen=None;vf=0
        for p in prefs[y]:
            items=search(cid,y,p)
            chosen,vf=full_scene(items,['red','B4','B3'],30)
            if chosen:break
        if not chosen:man['years'].append(rec);continue
        rk=find_key(chosen,['red']);gk=find_key(chosen,['green']);bk=find_key(chosen,['blue']);pk=find_key(chosen,['pan','panchromatic'])
        if not all([rk,gk,bk]):rec.update(status='missing_rgb',assets=list(chosen.assets));man['years'].append(rec);continue
        r=read_band(chosen,rk,30);g=read_band(chosen,gk,30);b=read_band(chosen,bk,30)
        dt=date_of(chosen);plat=chosen.properties.get('platform','landsat');base=f'{y}_{dt}_{plat}_2km'
        p30=d/(base+'_RGB30m.png');save_rgb([r,g,b],p30);files=[p30.name]
        if pk:
            try:
                r15=read_band(chosen,rk,15);g15=read_band(chosen,gk,15);b15=read_band(chosen,bk,15);pan=read_band(chosen,pk,15)
                sr,sg,sb,sp=map(stretch,[r15,g15,b15,pan]); inten=(sr+sg+sb)/3+1e-4; q=sp/inten
                sharp=np.stack([np.clip(sr*q,0,1),np.clip(sg*q,0,1),np.clip(sb*q,0,1)],-1)
                ps=d/(base+'_RGB_pansharpened15m.png');Image.fromarray(np.rint(sharp*255).astype(np.uint8),'RGB').save(ps,optimize=True)
                pp=d/(base+'_PAN15m.png');save_gray(pan,pp);files += [ps.name,pp.name]
            except Exception as e:rec['pan_error']=repr(e)
        rec.update(status='ok',date=dt,platform=plat,item_id=chosen.id,cloud=cloud(chosen),valid_fraction=round(vf,5),files=files);man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');return zip_pack(d,'USGS_Landsat_2km.zip'),man


def sentinel_pack():
    d=ROOT/'ESA_Sentinel2';shutil.rmtree(d,ignore_errors=True);d.mkdir()
    man={'source':'ESA/Copernicus Sentinel-2 L2A via Microsoft Planetary Computer','crop':'2 km x 2 km','center':[LAT,LON],'years':[]}
    cid='sentinel-2-l2a'
    for y in [2015,2020,2026]:
        rec={'year':y,'status':'not_found'};items=search(cid,y)
        chosen,vf=full_scene(items,['visual','red','B04'],10)
        if not chosen:man['years'].append(rec);continue
        vk=find_key(chosen,['visual'])
        dt=date_of(chosen);base=f'{y}_{dt}_Sentinel-2_2km'
        if vk:
            try:
                r=read_band(chosen,vk,10,1);g=read_band(chosen,vk,10,2);b=read_band(chosen,vk,10,3)
            except Exception:
                vk=None
        if not vk:
            rk=find_key(chosen,['red','B04']);gk=find_key(chosen,['green','B03']);bk=find_key(chosen,['blue','B02'])
            if not all([rk,gk,bk]):rec.update(status='missing_rgb',assets=list(chosen.assets));man['years'].append(rec);continue
            r=read_band(chosen,rk,10);g=read_band(chosen,gk,10);b=read_band(chosen,bk,10)
        p=d/(base+'_RGB10m.png');save_rgb([r,g,b],p)
        rec.update(status='ok',date=dt,item_id=chosen.id,cloud=cloud(chosen),valid_fraction=round(vf,5),files=[p.name]);man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');return zip_pack(d,'ESA_Copernicus_Sentinel2_2km.zip'),man


def aster_pack():
    d=ROOT/'NASA_Terra_ASTER';shutil.rmtree(d,ignore_errors=True);d.mkdir()
    cid=collection_by_terms('aster','l1t')
    man={'source':'NASA Terra ASTER L1T via Microsoft Planetary Computer','collection':cid,'crop':'2 km x 2 km','center':[LAT,LON],'years':[],'note':'False color NIR/Red/Green; ASTER VNIR has no blue band.'}
    if cid:
        for y in YEARS:
            rec={'year':y,'status':'not_in_pc_archive' if y>2006 else 'not_found'}
            if y>2006:man['years'].append(rec);continue
            items=search(cid,y);chosen,vf=full_scene(items,['VNIR_Band2','red','B2'],15)
            if not chosen:man['years'].append(rec);continue
            gk=find_key(chosen,['VNIR_Band1','B1','green']);rk=find_key(chosen,['VNIR_Band2','B2','red']);nk=find_key(chosen,['VNIR_Band3N','B3N','nir'])
            if not all([gk,rk,nk]):rec.update(status='missing_vnir',assets=list(chosen.assets));man['years'].append(rec);continue
            green=read_band(chosen,gk,15);red=read_band(chosen,rk,15);nir=read_band(chosen,nk,15);dt=date_of(chosen)
            p=d/f'{y}_{dt}_Terra_ASTER_2km_falsecolor_NIR_R_G_15m.png';save_rgb([nir,red,green],p)
            rec.update(status='ok',date=dt,item_id=chosen.id,cloud=cloud(chosen),valid_fraction=round(vf,5),files=[p.name]);man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');return zip_pack(d,'NASA_Terra_ASTER_2km.zip'),man


def alos_pack():
    d=ROOT/'JAXA_ALOS_PALSAR';shutil.rmtree(d,ignore_errors=True);d.mkdir()
    cid=collection_by_terms('alos','palsar','mosaic')
    man={'source':'JAXA ALOS/ALOS-2 PALSAR Annual Mosaic via Microsoft Planetary Computer','collection':cid,'crop':'2 km x 2 km','center':[LAT,LON],'years':[],'note':'SAR radar, not optical. Water often appears dark.'}
    if cid:
        for y in YEARS:
            rec={'year':y,'status':'not_found'};items=search(cid,y);chosen,vf=full_scene(items,['hh','HH'],25)
            if not chosen:man['years'].append(rec);continue
            hk=find_key(chosen,['hh','HH']);vk=find_key(chosen,['hv','HV']);hh=read_band(chosen,hk,25,nearest=True);dt=date_of(chosen)
            pg=d/f'{y}_{dt or y}_JAXA_ALOS_PALSAR_HH25m.png';save_gray(hh,pg,log=True);files=[pg.name]
            if vk:
                hv=read_band(chosen,vk,25,nearest=True);shh=stretch(np.where(hh>0,10*np.log10(hh),np.nan),1,99);shv=stretch(np.where(hv>0,10*np.log10(hv),np.nan),1,99);ratio=np.clip(shh-shv+0.5,0,1)
                rgb=np.stack([shh,shv,ratio],-1);pr=d/f'{y}_{dt or y}_JAXA_ALOS_PALSAR_HH_HV_falsecolor25m.png';Image.fromarray(np.rint(rgb*255).astype(np.uint8),'RGB').save(pr,optimize=True);files.append(pr.name)
            rec.update(status='ok',date=dt,item_id=chosen.id,valid_fraction=round(vf,5),files=files);man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');return zip_pack(d,'JAXA_ALOS_PALSAR_2km.zip'),man


def main():
    results={}
    for name,fn in [('USGS_Landsat',landsat_pack),('ESA_Sentinel2',sentinel_pack),('NASA_ASTER',aster_pack),('JAXA_ALOS_PALSAR',alos_pack)]:
        print('\n===',name,'===',flush=True)
        try:z,m=fn();results[name]={'zip':z.name,'manifest':m}
        except Exception as e:print('FAILED',name,repr(e),flush=True);results[name]={'error':repr(e)}
    (ROOT/'SUMMARY.json').write_text(json.dumps({'center':[LAT,LON],'crop':'2 km x 2 km','years':YEARS,'results':results,'integrity':'No generated AI imagery. PNGs are deterministic displays of real satellite pixels.'},indent=2),encoding='utf-8')
    allzip=ROOT/'ALL_SATELLITES_2km.zip'
    with zipfile.ZipFile(allzip,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in ROOT.rglob('*'):
            if p.is_file() and p!=allzip and not p.name.endswith('.zip'):z.write(p,p.relative_to(ROOT))
    for p in sorted(ROOT.rglob('*')):
        if p.is_file():print(p,p.stat().st_size,flush=True)

if __name__=='__main__':main()
