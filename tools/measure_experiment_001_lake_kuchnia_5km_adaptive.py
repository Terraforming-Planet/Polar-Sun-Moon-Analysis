from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from scipy import ndimage
from scipy.cluster.vq import kmeans2

import measure_experiment_001_seasonal_water_v3 as m

OUT=Path('experiments/experiment_001_pond_forest_kuchnia/measurements_lake_kuchnia_5km')
OUT.mkdir(parents=True,exist_ok=True)

HALF=2500.0
RES=30.0
BOUNDS=(m.base.CX-HALF,m.base.CY-HALF,m.base.CX+HALF,m.base.CY+HALF)
N=int(round((2*HALF)/RES))
TRANSFORM=from_bounds(*BOUNDS,width=N,height=N)

# Several points well inside the connected main water body, derived from the
# fixed 2km imagery. They are only training seeds; the final component boundary
# is determined from the 5km satellite bands.
SEEDS_OFFSETS_M=[
    (500,-200),
    (750,-300),
    (900,-450),
    (1100,-600),
]

RECORDS=[
    {'year':1990,'date':'1990-05-02','platform':'landsat-5','item_id':'LT05_L2SP_190023_19900502_02_T1'},
    {'year':2026,'date':'2026-05-01','platform':'Sentinel-2C','item_id':'S2C_MSIL2A_20260501T095031_R079_T33UYV_20260501T132213'},
    {'year':2026,'date':'2026-08-07','platform':'Sentinel-2B','item_id':'S2B_MSIL2A_20260807T100029_R122_T33UYV_20260807T135548'},
]


def rc(x,y):
    c=int(round((x-BOUNDS[0])/(2*HALF)*(N-1)))
    r=int(round((BOUNDS[3]-y)/(2*HALF)*(N-1)))
    return max(0,min(N-1,r)),max(0,min(N-1,c))


def read(item,key,nearest=False,scaled=True):
    dst=np.full((N,N),np.nan,np.float32)
    href=m.base.sign(item['assets'][key]['href'],item['collection'])
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_MULTIRANGE='YES',GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES'):
        with rasterio.open(href) as src:
            reproject(source=rasterio.band(src,1),destination=dst,src_transform=src.transform,src_crs=src.crs,src_nodata=src.nodata,dst_transform=TRANSFORM,dst_crs=m.base.TARGET_CRS,dst_nodata=np.nan,resampling=Resampling.nearest if nearest else Resampling.bilinear)
    if scaled:
        sc,off=m.base.scale_offset(item,key); dst=dst*sc+off
    return dst


def clear_mask(item):
    if item.get('collection')=='sentinel-2-l2a':
        k=m.base.asset_key(item,['SCL','scl','scene-classification'],[])
        if not k:return np.ones((N,N),bool)
        s=read(item,k,nearest=True,scaled=False); s=np.where(np.isfinite(s),s,0).astype(np.int16)
        return np.isin(s,[2,4,5,6,7])
    k=m.base.asset_key(item,['qa_pixel','QA_PIXEL','qa'],[])
    if not k:return np.ones((N,N),bool)
    q0=read(item,k,nearest=True,scaled=False); finite=np.isfinite(q0); q=np.where(finite,q0,0).astype(np.uint32)
    bad=((q&1)!=0)|(((q>>1)&1)!=0)|(((q>>2)&1)!=0)|(((q>>3)&1)!=0)|(((q>>4)&1)!=0)|(((q>>5)&1)!=0)
    return finite&(~bad)


def indices(item):
    gk=m._band_key(item,'green'); nk=m._band_key(item,'nir'); sk=m._band_key(item,'swir1')
    g,n,s=read(item,gk),read(item,nk),read(item,sk)
    clear=clear_mask(item)
    ndwi=np.full(g.shape,np.nan,np.float32); d=g+n; ok=np.isfinite(g)&np.isfinite(n)&(np.abs(d)>1e-7); ndwi[ok]=(g[ok]-n[ok])/d[ok]
    mndwi=np.full(g.shape,np.nan,np.float32); d2=g+s; ok2=np.isfinite(g)&np.isfinite(s)&(np.abs(d2)>1e-7); mndwi[ok2]=(g[ok2]-s[ok2])/d2[ok2]
    return ndwi,mndwi,clear,(gk,nk,sk)


def seed_rcs():
    return [rc(m.base.CX+dx,m.base.CY+dy) for dx,dy in SEEDS_OFFSETS_M]


def adaptive_water(ndwi,mndwi,clear):
    # Restrict clustering to a 3.8x3.8 km lake neighbourhood to reduce unrelated
    # urban/field classes while still containing the complete connected lake.
    rr,cc=np.indices((N,N))
    xs=BOUNDS[0]+(cc+0.5)*(2*HALF/N)
    ys=BOUNDS[3]-(rr+0.5)*(2*HALF/N)
    roi=(xs>=m.base.CX-500)&(xs<=m.base.CX+2400)&(ys>=m.base.CY-2100)&(ys<=m.base.CY+700)
    valid=roi&clear&np.isfinite(ndwi)&np.isfinite(mndwi)
    feat=np.column_stack([ndwi[valid],mndwi[valid]]).astype(np.float64)
    if len(feat)<100:raise RuntimeError('too few valid pixels')
    med=np.median(feat,axis=0); mad=np.median(np.abs(feat-med),axis=0); mad=np.where(mad<1e-5,1.0,mad)
    z=(feat-med)/mad
    # deterministic kmeans initialization from feature quantiles
    order=np.argsort(z[:,0]+z[:,1])
    init=np.vstack([z[order[int((i+0.5)/5*len(order))]] for i in range(5)])
    centers,labels=kmeans2(z,init,minit='matrix',iter=60)

    # Water is the high-index end of the local feature space. Include two most
    # water-like spectral clusters, then use connectivity to reject unrelated pixels.
    cluster_score=centers[:,0]+centers[:,1]
    water_clusters=np.argsort(cluster_score)[-2:]
    candidate=np.zeros((N,N),bool); candidate[valid]=np.isin(labels,water_clusters)
    candidate=ndimage.binary_closing(candidate,structure=np.ones((3,3)),iterations=1)

    seed_labels=[]
    comp_labels,count=ndimage.label(candidate,structure=np.ones((3,3),np.uint8))
    for r,c in seed_rcs():
        lab=int(comp_labels[r,c])
        if lab:seed_labels.append(lab)
    if not seed_labels:
        # If seed sits on a boundary due to 30m resampling, pick nearest candidate
        r0,c0=seed_rcs()[0]; coords=np.argwhere(candidate)
        if coords.size==0:raise RuntimeError('no adaptive water candidate')
        d2=(coords[:,0]-r0)**2+(coords[:,1]-c0)**2; yy,xx=coords[int(np.argmin(d2))]
        seed_labels=[int(comp_labels[yy,xx])]
    # Union any components reached by the internal lake seeds.
    lake=np.isin(comp_labels,list(set(seed_labels)))
    lake=ndimage.binary_fill_holes(lake)
    return lake,roi,centers,cluster_score,water_clusters


def render(item,ndwi,mndwi,clear,lake,record):
    # Context image uses normalized MNDWI; detected lake in cyan.
    valid=np.isfinite(mndwi); g=np.zeros((N,N),np.uint8)
    if np.any(valid):
        lo,hi=np.percentile(mndwi[valid],[2,98]); hi=max(hi,lo+1e-6); g[valid]=np.clip((mndwi[valid]-lo)/(hi-lo)*255,0,255).astype(np.uint8)
    rgb=np.stack([g,g,g],axis=-1); rgb[~clear]=[90,90,90]; rgb[lake]=[0,220,255]
    im=Image.fromarray(rgb).resize((900,900),Image.Resampling.NEAREST); d=ImageDraw.Draw(im); d.rectangle((0,0,899,45),fill='white'); d.text((8,12),f"{record['date']} {record['platform']} | cyan adaptive connected Lake Kuchnia",fill='black')
    p=OUT/f"{record['year']}_{record['date']}_{record['platform']}_lake_5km_adaptive.png"; im.save(p,optimize=True); return str(p)


def measure(record):
    item=m.l2_item(record)
    assert item['id']==record['item_id'],(item['id'],record['item_id'])
    ndwi,mndwi,clear,bands=indices(item)
    lake,roi,centers,scores,water_clusters=adaptive_water(ndwi,mndwi,clear)
    area=float(lake.sum()*RES*RES)
    # Boundary uncertainty: one 30m erosion/dilation ring.
    er=ndimage.binary_erosion(lake,structure=np.ones((3,3)))
    di=ndimage.binary_dilation(lake,structure=np.ones((3,3)))
    low=float(er.sum()*RES*RES); high=float(di.sum()*RES*RES)
    overlay=render(item,ndwi,mndwi,clear,lake,record)
    return {
        **record,'measurement_item_id':item['id'],'measurement_grid_m':RES,'area_m2':area,'area_ha':area/10000.0,
        'boundary_low_m2':low,'boundary_high_m2':high,'clear_fraction_roi':float((clear&roi).sum()/max(roi.sum(),1)),
        'bands':bands,'cluster_centers_standardized':centers.tolist(),'cluster_scores':scores.tolist(),'selected_water_clusters':[int(x) for x in water_clusters],
        'overlay':overlay,
    }


def comparison(a,b):
    loss=a['area_m2']-b['area_m2']
    return {'from':a['date'],'to':b['date'],'area_from_m2':a['area_m2'],'area_to_m2':b['area_m2'],'difference_m2':loss,'difference_ha':loss/10000.0,'difference_percent':loss/a['area_m2']*100 if a['area_m2'] else None,'from_boundary_range_m2':[a['boundary_low_m2'],a['boundary_high_m2']],'to_boundary_range_m2':[b['boundary_low_m2'],b['boundary_high_m2']]}


def main():
    rows=[measure(r) for r in RECORDS]
    for r in rows:print('LAKE5KM',r['date'],r['area_m2'],r['boundary_low_m2'],r['boundary_high_m2'],r['clear_fraction_roi'],flush=True)
    a=next(r for r in rows if r['year']==1990); may=next(r for r in rows if r['date']=='2026-05-01'); aug=next(r for r in rows if r['date']=='2026-08-07')
    comps=[comparison(a,may),comparison(a,aug)]
    out={'experiment_id':'001','object':'Lake Kuchnia','aoi':'5 km x 5 km around Experiment 001 center to avoid truncation by original 2 km crop','method':'exact products; original L2 green/NIR/SWIR; scene-adaptive 5-cluster NDWI/MNDWI classification; two most water-like clusters; connected components reached by multiple lake-core seeds; 30m common grid','records':rows,'comparisons':comps,'status':'preliminary adaptive lake measurement; visual overlay validation required before final publication'}
    (OUT/'lake_kuchnia_5km_adaptive_measurement.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf-8')
    md=['# Lake Kuchnia — adaptive 5 km endpoint measurement','','The original 2 km imagery cuts the lake on the east/south edges and is not valid for full-lake area totals. This workflow uses a 5 km area and exact source product IDs.','']
    for r in rows:md.append(f"- {r['date']} {r['platform']}: **{r['area_m2']:.0f} m² = {r['area_ha']:.2f} ha**, boundary range {r['boundary_low_m2']:.0f}–{r['boundary_high_m2']:.0f} m²")
    md+=['','## Comparisons']
    for c in comps:md.append(f"- {c['from']} → {c['to']}: {c['difference_m2']:.0f} m² ({c['difference_percent']:.2f}%)")
    md+=['','Status: **PRELIMINARY** until the generated cyan lake masks are visually checked against the optical scene.']
    (OUT/'README.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
    print('COMPARISONS',json.dumps(comps),flush=True)

if __name__=='__main__':main()
