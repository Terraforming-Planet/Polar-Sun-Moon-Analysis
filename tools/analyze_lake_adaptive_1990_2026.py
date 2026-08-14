from __future__ import annotations
import csv, json, math, os, time
from pathlib import Path
import numpy as np, rasterio, requests
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from scipy import ndimage

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'satellite_may_1990_2026'/'53.591400_19.010717'/'manifest.json'
OUT=ROOT/'water_analysis_1990_2026'/'53.591400_19.010717'/'lake_adaptive.csv'
LAT,LON=53.591400,19.010717
LAKE_LAT,LAKE_LON=53.58809,19.01969
CRS='EPSG:32634'; HALF=2000.0
TR=Transformer.from_crs('EPSG:4326',CRS,always_xy=True)
CX,CY=TR.transform(LON,LAT); LX,LY=TR.transform(LAKE_LON,LAKE_LAT)
BOUNDS=(CX-HALF,CY-HALF,CX+HALF,CY+HALF)
PC='https://planetarycomputer.microsoft.com/api/stac/v1'; SEARCH=PC+'/search'; TOKEN='https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}'
S=requests.Session(); TOK={}

def req(method,url,**kw):
    last=None
    for i in range(7):
        r=S.request(method,url,timeout=120,**kw); last=r
        if r.status_code not in (429,500,502,503,504): r.raise_for_status(); return r.json()
        time.sleep(min(20,2**i))
    last.raise_for_status()

def tok(c):
    if c not in TOK:TOK[c]=req('GET',TOKEN.format(collection=c))['token']
    return TOK[c]

def sign(h,c): return h if ('sig=' in h or 'se=' in h) else h+('&' if '?' in h else '?')+tok(c)

def item(rec):
    cols=['sentinel-2-l2a'] if 'Sentinel' in str(rec.get('platform')) else ['landsat-c2-l2']
    for c in cols:
        d=req('POST',SEARCH,json={'collections':[c],'ids':[rec['item_id']],'limit':2})
        if d.get('features'):return d['features'][0]
    raise RuntimeError(rec['item_id'])

def key(it,common,exact):
    a=it['assets']
    # common names first to avoid Landsat band-number ambiguity
    for k,v in a.items():
        for b in v.get('eo:bands',[]) or []:
            if str(b.get('common_name','')).lower() in [x.lower() for x in common]: return k
    for x in exact:
        if x in a:return x
    low={k.lower():k for k in a}
    for x in exact:
        if x.lower() in low:return low[x.lower()]
    return None

def scaleoff(it,k):
    rb=it['assets'][k].get('raster:bands') or []
    if rb:
        return float(rb[0].get('scale',1.0)),float(rb[0].get('offset',0.0))
    if it['collection']=='landsat-c2-l2':return 0.0000275,-0.2
    return 0.0001,0.0

def read(it,k,res,nearest=False,scaled=True):
    n=int(round(2*HALF/res)); tr=from_bounds(*BOUNDS,width=n,height=n); out=np.full((n,n),np.nan,np.float32)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',GDAL_HTTP_MULTIRANGE='YES',GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES'):
      with rasterio.open(sign(it['assets'][k]['href'],it['collection'])) as src:
        reproject(source=rasterio.band(src,1),destination=out,src_transform=src.transform,src_crs=src.crs,src_nodata=src.nodata,dst_transform=tr,dst_crs=CRS,dst_nodata=np.nan,resampling=Resampling.nearest if nearest else Resampling.bilinear)
    if scaled:
      sc,off=scaleoff(it,k);out=out*sc+off
    return out

def clear(it,res,shape):
    if it['collection']=='sentinel-2-l2a':
      k=key(it,[],['SCL','scl']);
      if not k:return np.ones(shape,bool)
      x=read(it,k,res,True,False);s=np.where(np.isfinite(x),x,0).astype(np.int16)
      return np.isin(s,[2,4,5,6,7])
    k=key(it,[],['qa_pixel','QA_PIXEL'])
    if not k:return np.ones(shape,bool)
    x=read(it,k,res,True,False);q=np.where(np.isfinite(x),x,0).astype(np.uint32)
    bad=((q&1)!=0)|(((q>>1)&1)!=0)|(((q>>2)&1)!=0)|(((q>>3)&1)!=0)|(((q>>4)&1)!=0)|(((q>>5)&1)!=0)
    return np.isfinite(x)&(~bad)

def rc(x,y,res):
    n=int(round(2*HALF/res));c=int(round((x-(CX-HALF))/(2*HALF)*(n-1)));r=int(round(((CY+HALF)-y)/(2*HALF)*(n-1)));return r,c

def main():
  mani=json.loads(SRC.read_text()); rows=[]
  for rec in mani['records']:
    y=rec['year']; print('YEAR',y,flush=True)
    try:
      it=item(rec); res=10.0 if it['collection']=='sentinel-2-l2a' else 30.0
      gk=key(it,['green'],['green','B03','SR_B3','SR_B2']); nk=key(it,['nir','nir08'],['nir08','nir','B08','SR_B5','SR_B4']); sk=key(it,['swir16','swir'],['swir16','B11','SR_B6','SR_B5'])
      g=read(it,gk,res);n=read(it,nk,res);s=read(it,sk,res) if sk else n
      cm=clear(it,res,g.shape)
      den=g+s; idx=np.full(g.shape,np.nan,np.float32); good=np.isfinite(g)&np.isfinite(s)&(np.abs(den)>1e-6); idx[good]=(g[good]-s[good])/den[good]
      rr,cc=np.indices(g.shape); pix=2*HALF/g.shape[0]; sr,sc=rc(LX,LY,res)
      xs=(CX-HALF)+(cc+.5)*pix; ys=(CY+HALF)-(rr+.5)*pix
      roi=(xs>=CX-500)&(xs<=CX+1900)&(ys>=CY-1650)&(ys<=CY+700)
      core=((rr-sr)**2+(cc-sc)**2)<=(180/pix)**2
      vals=idx[core&cm&np.isfinite(idx)]
      nirvals=n[core&cm&np.isfinite(n)]
      if len(vals)<3: raise RuntimeError('lake core unavailable')
      q10=float(np.percentile(vals,10)); med=float(np.median(vals)); nir90=float(np.percentile(nirvals,90))
      thr=max(-0.35,min(0.08,q10-0.12)); nthr=max(0.04,min(0.30,nir90+0.05))
      cand=roi&cm&np.isfinite(idx)&np.isfinite(n)&(idx>thr)&(n<nthr)
      lab,cnt=ndimage.label(cand,np.ones((3,3),np.uint8)); lbl=lab[sr,sc]
      if lbl==0:
        coords=np.argwhere(cand); d=((coords[:,0]-sr)**2+(coords[:,1]-sc)**2) if len(coords) else np.array([])
        if len(coords) and math.sqrt(float(d.min()))*pix<350: lbl=lab[tuple(coords[int(np.argmin(d))])]
      mask=lab==lbl if lbl else np.zeros_like(cand)
      area=float(mask.sum()*pix*pix)
      er=ndimage.binary_erosion(mask,np.ones((3,3)))
      di=ndimage.binary_dilation(mask,np.ones((3,3)))&roi
      low=float(er.sum()*pix*pix); high=float(di.sum()*pix*pix)
      rows.append({'year':y,'date':rec['date'],'platform':rec['platform'],'resolution_m':int(res),'area_m2':round(area),'low_m2':round(low),'high_m2':round(high),'adaptive_threshold':round(thr,4),'lake_core_mndwi_median':round(med,4),'lake_core_mndwi_q10':round(q10,4),'nir_limit':round(nthr,4),'manifest_clear':rec.get('local_clear_fraction'),'manifest_valid':rec.get('local_valid_fraction')})
    except Exception as e: rows.append({'year':y,'date':rec.get('date'),'platform':rec.get('platform'),'error':repr(e)})
  with OUT.open('w',newline='',encoding='utf-8') as f:
    fields=sorted({k for r in rows for k in r});w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
  print(json.dumps(rows,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
