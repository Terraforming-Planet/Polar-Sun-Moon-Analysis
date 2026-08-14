from __future__ import annotations

import csv
import json
import math
import os
import time
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image, ImageDraw
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from scipy import ndimage

LAT=53.591400
LON=19.010717
TARGET_CRS='EPSG:32634'
HALF_SIZE_M=2000.0
COMMON_RES=30.0
EXP=Path('experiments/experiment_001_pond_forest_kuchnia')
OUT=EXP/'measurements'
MASKS=OUT/'masks'
OUT.mkdir(parents=True,exist_ok=True); MASKS.mkdir(parents=True,exist_ok=True)

PC_STAC='https://planetarycomputer.microsoft.com/api/stac/v1'
PC_SEARCH=PC_STAC+'/search'
PC_TOKEN='https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}'
SESSION=requests.Session(); TOKENS={}
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN','EMPTY_DIR')
os.environ.setdefault('GDAL_HTTP_MULTIRANGE','YES')
os.environ.setdefault('GDAL_HTTP_MERGE_CONSECUTIVE_RANGES','YES')

TR=Transformer.from_crs('EPSG:4326',TARGET_CRS,always_xy=True)
INV=Transformer.from_crs(TARGET_CRS,'EPSG:4326',always_xy=True)
CX,CY=TR.transform(LON,LAT)
BOUNDS=(CX-HALF_SIZE_M,CY-HALF_SIZE_M,CX+HALF_SIZE_M,CY+HALF_SIZE_M)

# IMPORTANT GEOMETRY CORRECTION (2026-08-14 image-first review):
# Repeated 1990/1998/2000/2004/2005 imagery places the disappearing forest pond
# around display pixel x~160,y~320 in the fixed 2 km/1024 px crops, i.e. about
# 690 m west and 375 m north of the experiment center. The earlier provisional
# seed near the west bay of Lake Kuchnia was wrong and MUST NOT be used.
POND_X,POND_Y=CX-690.0,CY+375.0
POND_LON,POND_LAT=INV.transform(POND_X,POND_Y)

# Lake Kuchnia seed is deliberately inside the main persistent water body.
LAKE_LON,LAKE_LAT=19.02326,53.58894
LAKE_X,LAKE_Y=TR.transform(LAKE_LON,LAKE_LAT)


def request_json(method,url,**kwargs):
    last=None
    for attempt in range(8):
        r=SESSION.request(method,url,timeout=120,**kwargs); last=r
        if r.status_code not in (429,500,502,503,504):
            r.raise_for_status(); return r.json()
        time.sleep(min(30,2**attempt))
    last.raise_for_status()


def token(collection):
    if collection not in TOKENS:
        TOKENS[collection]=request_json('GET',PC_TOKEN.format(collection=collection))['token']
    return TOKENS[collection]


def sign(href,collection):
    if 'sig=' in href or 'se=' in href: return href
    return href+('&' if '?' in href else '?')+token(collection)


def platform_norm(s):
    return str(s or '').lower().replace('_','-')


def l2_item(record):
    dt=record['date']; platform=platform_norm(record.get('platform'))
    collection='sentinel-2-l2a' if 'sentinel' in platform else 'landsat-c2-l2'
    data=request_json('POST',PC_SEARCH,json={'collections':[collection],'bbox':[LON-0.05,LAT-0.04,LON+0.05,LAT+0.04],'datetime':f'{dt}T00:00:00Z/{dt}T23:59:59Z','limit':100})
    items=data.get('features',[])
    if not items: raise RuntimeError(f'no L2 item for {dt} {platform}')
    def score(i):
        p=platform_norm(i.get('properties',{}).get('platform'))
        match=0 if (not platform or platform in p or p in platform) else 1
        cloud=float(i.get('properties',{}).get('eo:cloud_cover',100) or 100)
        return (match,cloud)
    items.sort(key=score)
    return items[0]


def asset_key(item,exact,common):
    assets=item.get('assets',{})
    for k in exact:
        if k in assets: return k
    low={k.lower():k for k in assets}
    for k in exact:
        if k.lower() in low: return low[k.lower()]
    common_lower=[x.lower() for x in common]
    for key,a in assets.items():
        for b in (a.get('eo:bands') or []):
            if str(b.get('common_name','')).lower() in common_lower: return key
    return None


def grid(res=COMMON_RES):
    n=int(round((2*HALF_SIZE_M)/res)); return n,from_bounds(*BOUNDS,width=n,height=n)


def scale_offset(item,key):
    rb=item['assets'][key].get('raster:bands') or []
    if rb and (rb[0].get('scale') is not None or rb[0].get('offset') is not None):
        return float(rb[0].get('scale',1)),float(rb[0].get('offset',0))
    if item.get('collection')=='landsat-c2-l2': return 0.0000275,-0.2
    if item.get('collection')=='sentinel-2-l2a': return 0.0001,0.0
    return 1.0,0.0


def read(item,key,res=COMMON_RES,nearest=False,scaled=True):
    n,t=grid(res); dst=np.full((n,n),np.nan,np.float32)
    href=sign(item['assets'][key]['href'],item['collection'])
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_MULTIRANGE='YES',GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES'):
        with rasterio.open(href) as src:
            reproject(source=rasterio.band(src,1),destination=dst,src_transform=src.transform,src_crs=src.crs,src_nodata=src.nodata,dst_transform=t,dst_crs=TARGET_CRS,dst_nodata=np.nan,resampling=Resampling.nearest if nearest else Resampling.bilinear)
    if scaled:
        sc,off=scale_offset(item,key); dst=dst*sc+off
    return dst


def clear_mask(item,shape):
    if item.get('collection')=='sentinel-2-l2a':
        k=asset_key(item,['SCL','scl','scene-classification'],[])
        if not k: return np.ones(shape,bool)
        s=read(item,k,nearest=True,scaled=False); s=np.where(np.isfinite(s),s,0).astype(np.int16)
        return np.isin(s,[2,4,5,6,7])
    k=asset_key(item,['qa_pixel','QA_PIXEL','qa'],[])
    if not k: return np.ones(shape,bool)
    q0=read(item,k,nearest=True,scaled=False); finite=np.isfinite(q0); q=np.where(finite,q0,0).astype(np.uint32)
    bad=((q&1)!=0)|(((q>>1)&1)!=0)|(((q>>2)&1)!=0)|(((q>>3)&1)!=0)|(((q>>4)&1)!=0)|(((q>>5)&1)!=0)
    return finite & (~bad)


def coordinate_arrays(shape):
    n=shape[0]; rr,cc=np.indices(shape)
    xs=(CX-HALF_SIZE_M)+(cc+0.5)*(2*HALF_SIZE_M/n)
    ys=(CY+HALF_SIZE_M)-(rr+0.5)*(2*HALF_SIZE_M/n)
    return xs,ys


def rc_for(x,y,shape):
    n=shape[0]
    c=int(round((x-(CX-HALF_SIZE_M))/(2*HALF_SIZE_M)*(n-1)))
    r=int(round(((CY+HALF_SIZE_M)-y)/(2*HALF_SIZE_M)*(n-1)))
    return max(0,min(n-1,r)),max(0,min(n-1,c))


def rois(shape):
    xs,ys=coordinate_arrays(shape)
    # Forest pond basin: isolate the visually verified western forest feature.
    pond=(np.abs(xs-POND_X)<=330)&(np.abs(ys-POND_Y)<=330)
    # Lake Kuchnia: broad window around the main water body, separated from pond ROI.
    lake=(xs>=CX-200)&(xs<=CX+1900)&(ys>=CY-1600)&(ys<=CY+550)
    return pond,lake


def connected(binary,roi,seed,maxdist_m):
    b=binary&roi; labels,n=ndimage.label(b,structure=np.ones((3,3),np.uint8))
    if n==0: return np.zeros_like(b)
    sr,sc=seed; lab=labels[sr,sc]
    if lab==0:
        coords=np.argwhere(b)
        if coords.size==0:return np.zeros_like(b)
        d2=(coords[:,0]-sr)**2+(coords[:,1]-sc)**2; j=int(np.argmin(d2))
        if math.sqrt(float(d2[j]))*COMMON_RES>maxdist_m:return np.zeros_like(b)
        lab=labels[tuple(coords[j])]
    return labels==lab


def water_indices(item):
    gk=asset_key(item,['green','B03','B3','SR_B3','SR_B2'],['green'])
    nk=asset_key(item,['nir08','nir','B08','B8','B5','B4','SR_B5','SR_B4'],['nir08','nir'])
    sk=asset_key(item,['swir16','B11','B6','SR_B6','SR_B5'],['swir16','swir'])
    if not gk or not nk or not sk: raise RuntimeError(f'missing spectral keys {list(item.get("assets",{}))}')
    g,n,s=read(item,gk),read(item,nk),read(item,sk)
    clear=clear_mask(item,g.shape)
    ndwi=np.full(g.shape,np.nan,np.float32); den=g+n; good=np.isfinite(g)&np.isfinite(n)&(np.abs(den)>1e-7); ndwi[good]=(g[good]-n[good])/den[good]
    mndwi=np.full(g.shape,np.nan,np.float32); den2=g+s; good2=np.isfinite(g)&np.isfinite(s)&(np.abs(den2)>1e-7); mndwi[good2]=(g[good2]-s[good2])/den2[good2]
    return ndwi,mndwi,clear


def mask_for_threshold(ndwi,mndwi,clear,roi,seed,threshold,maxdist):
    candidate=clear&np.isfinite(ndwi)&np.isfinite(mndwi)&(mndwi>threshold)&(ndwi>-0.08)
    return connected(candidate,roi,seed,maxdist)


def object_measure(ndwi,mndwi,clear,roi,seed,maxdist):
    thresholds=[-0.05,0.0,0.05,0.10,0.15]
    masks=[mask_for_threshold(ndwi,mndwi,clear,roi,seed,t,maxdist) for t in thresholds]
    areas=[float(m.sum()*COMMON_RES*COMMON_RES) for m in masks]
    central=masks[2]; central_area=areas[2]
    er=ndimage.binary_erosion(central,structure=np.ones((3,3)))
    di=ndimage.binary_dilation(central,structure=np.ones((3,3)))&roi
    boundary_low=float(er.sum()*COMMON_RES*COMMON_RES); boundary_high=float(di.sum()*COMMON_RES*COMMON_RES)
    low=min(areas+[boundary_low]); high=max(areas+[boundary_high])
    return {'area_m2':central_area,'area_ha':central_area/10000.0,'low_m2':low,'high_m2':high,'threshold_areas_m2':dict(zip([str(t) for t in thresholds],areas)),'mask':central}


def overlay(mndwi,pond,lake,clear,season,year,date_text):
    valid=np.isfinite(mndwi); g=np.zeros(mndwi.shape,np.uint8)
    if np.any(valid):
        lo,hi=np.percentile(mndwi[valid],[2,98]); hi=max(hi,lo+1e-6); g[valid]=np.clip((mndwi[valid]-lo)/(hi-lo)*255,0,255).astype(np.uint8)
    rgb=np.stack([g,g,g],axis=-1); rgb[~clear]=[90,90,90]; rgb[lake]=[0,100,255]; rgb[pond]=[0,255,255]
    im=Image.fromarray(rgb).resize((800,800),Image.Resampling.NEAREST); d=ImageDraw.Draw(im); d.rectangle((0,0,799,45),fill='white'); d.text((8,12),f'{year} {date_text} {season} | blue Lake Kuchnia | cyan forest pond',fill='black')
    p=MASKS/f'{season}_{year}_{date_text}_common30m_water_mask.png'; im.save(p,optimize=True); return str(p)


def analyze_record(season,record):
    item=l2_item(record); ndwi,mndwi,clear=water_indices(item); pond_roi,lake_roi=rois(ndwi.shape)
    pond=object_measure(ndwi,mndwi,clear,pond_roi,rc_for(POND_X,POND_Y,ndwi.shape),260)
    lake=object_measure(ndwi,mndwi,clear,lake_roi,rc_for(LAKE_X,LAKE_Y,ndwi.shape),500)
    combined=pond_roi|lake_roi
    q=float(np.sum(clear&combined)/max(np.sum(combined),1))
    conf='high' if q>=0.97 else 'medium' if q>=0.80 else 'low'
    ov=overlay(mndwi,pond['mask'],lake['mask'],clear,season,int(record['year']),record['date'])
    return {'season':season,'year':int(record['year']),'date':record['date'],'platform':record.get('platform'),'display_native_resolution_m':record.get('native_resolution_m'),'measurement_grid_m':30,'selected_month':record.get('selected_month'),'fallback_month':record.get('is_fallback_month'),'clear_fraction_measurement_aoi':round(q,6),'confidence':conf,'pond_geometry_status':'image-first corrected seed; manual polygon boundary verification still required before final claim','forest_pond':{k:v for k,v in pond.items() if k!='mask'},'lake_kuchnia':{k:v for k,v in lake.items() if k!='mask'},'overlay':ov,'measurement_item_id':item.get('id'),'measurement_collection':item.get('collection')}


def endpoint(rows,season,obj):
    by={r['year']:r for r in rows if r['season']==season}
    if 1990 not in by or 2026 not in by:return None
    a=float(by[1990][obj]['area_m2']); b=float(by[2026][obj]['area_m2'])
    loss=a-b; pct=(loss/a*100.0) if a>0 else None
    return {'season':season,'object':obj,'area_1990_m2':a,'area_2026_m2':b,'loss_1990_to_2026_m2':loss,'loss_ha':loss/10000.0,'loss_percent':pct,'1990_uncertainty_m2':[by[1990][obj]['low_m2'],by[1990][obj]['high_m2']],'2026_uncertainty_m2':[by[2026][obj]['low_m2'],by[2026][obj]['high_m2']],'status':'preliminary_common30m_spectral_measurement_geometry_corrected'}


def main():
    allrows=[]; failures=[]
    for season in ('spring','autumn'):
        man=json.loads((EXP/'seasonal_evidence'/season/'manifest.json').read_text(encoding='utf-8'))
        for rec in man['records']:
            if rec.get('status')!='ok':continue
            try:
                r=analyze_record(season,rec); allrows.append(r); print('MEASURED',season,rec['year'],r['forest_pond']['area_m2'],r['lake_kuchnia']['area_m2'],r['confidence'],flush=True)
            except Exception as exc:
                failures.append({'season':season,'year':rec.get('year'),'date':rec.get('date'),'error':repr(exc)}); print('FAILED',season,rec.get('year'),repr(exc),flush=True)
    endpoints=[]
    for season in ('spring','autumn'):
        for obj in ('forest_pond','lake_kuchnia'):
            e=endpoint(allrows,season,obj)
            if e:endpoints.append(e)
    out={'experiment_id':'001','method':'Original L2 spectral bands; MNDWI+NDWI; common 30 m grid for cross-era comparability; threshold sensitivity plus boundary uncertainty','aoi_center':{'lat':LAT,'lon':LON},'pond_seed':{'lat':POND_LAT,'lon':POND_LON,'offset_from_aoi_center_m':{'west':690,'north':375},'status':'image-first corrected 2026-08-14; final polygon boundary still requires manual verification'},'records':allrows,'endpoint_comparisons':endpoints,'failures':failures,'working_estimate_before_measurement':{'loss_m2':25000,'loss_ha':2.5,'loss_percent':'near 100%','status':'provisional'}}
    (OUT/'seasonal_water_measurements.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf-8')
    fields=['season','year','date','platform','selected_month','fallback_month','confidence','pond_area_m2','pond_low_m2','pond_high_m2','lake_area_m2','lake_low_m2','lake_high_m2']
    with (OUT/'seasonal_water_measurements.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader()
        for r in allrows:
            w.writerow({'season':r['season'],'year':r['year'],'date':r['date'],'platform':r['platform'],'selected_month':r['selected_month'],'fallback_month':r['fallback_month'],'confidence':r['confidence'],'pond_area_m2':r['forest_pond']['area_m2'],'pond_low_m2':r['forest_pond']['low_m2'],'pond_high_m2':r['forest_pond']['high_m2'],'lake_area_m2':r['lake_kuchnia']['area_m2'],'lake_low_m2':r['lake_kuchnia']['low_m2'],'lake_high_m2':r['lake_kuchnia']['high_m2']})
    (OUT/'endpoint_1990_vs_2026.json').write_text(json.dumps(endpoints,indent=2,ensure_ascii=False),encoding='utf-8')
    print('POND_SEED',POND_LAT,POND_LON,flush=True)
    print('ENDPOINTS',json.dumps(endpoints,ensure_ascii=False),flush=True); print('FAILURES',len(failures),flush=True)

if __name__=='__main__':main()
