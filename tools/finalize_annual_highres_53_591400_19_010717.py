from __future__ import annotations

import io
import json
import shutil
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests
from PIL import Image
from pyproj import Transformer

LAT=53.591400; LON=19.010717
BASE=Path('satellite_annual_best/53.591400_19.010717')
ROOT=Path('satellite_annual_best_highres/53.591400_19.010717')
PS=ROOT/'2000_2014_Landsat_PS15m'
EPOCH=ROOT/'GLS_EPOCHS_15m'
FINAL=ROOT/'FINAL_27_YEARS_2000_2026'
SERVICE='https://landsat2.arcgis.com/arcgis/rest/services/Landsat/PS/ImageServer'
QUERY=SERVICE+'/query'; EXPORT=SERVICE+'/exportImage'
S=requests.Session()
tr=Transformer.from_crs('EPSG:4326','EPSG:32634',always_xy=True); cx,cy=tr.transform(LON,LAT)
BBOX=[cx-1000,cy-1000,cx+1000,cy+1000]


def req(url,params):
    last=None
    for i in range(6):
        r=S.get(url,params=params,timeout=90); last=r
        if r.status_code not in (429,500,502,503,504): return r
        time.sleep(min(20,2**i))
    return last

def date_ms(v):
    try:return datetime.fromtimestamp(float(v)/1000,tz=timezone.utc).date().isoformat()
    except:return ''
def q_epoch(ds):
    params={'where':f"Category = 1 AND dataset_id = '{ds}'",'geometry':f'{LON},{LAT}','geometryType':'esriGeometryPoint','inSR':'4326','spatialRel':'esriSpatialRelIntersects','outFields':'OBJECTID,SensorName,AcquisitionDate,CloudCover,dataset_id,LANDSAT_SCENE_ID,LANDSAT_PRODUCT_ID,Month,DayOfYear','returnGeometry':'false','orderByFields':'CloudCover ASC, AcquisitionDate ASC','f':'json'}
    r=req(QUERY,params); r.raise_for_status(); d=r.json(); return [x['attributes'] for x in d.get('features',[])]
def export_oid(oid):
    mosaic={'mosaicMethod':'esriMosaicLockRaster','lockRasterIds':[int(oid)],'mosaicOperation':'MT_FIRST'}
    render={'rasterFunction':'Pansharpened Natural Color'}
    params={'bbox':','.join(map(str,BBOX)),'bboxSR':'32634','imageSR':'32634','size':'134,134','format':'png32','mosaicRule':json.dumps(mosaic,separators=(',',':')),'renderingRule':json.dumps(render,separators=(',',':')),'f':'image'}
    r=req(EXPORT,params); r.raise_for_status()
    if 'image' not in r.headers.get('content-type','').lower(): raise RuntimeError(r.text[:400])
    return r.content
def zipdir(src,dst):
    with zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(src.rglob('*')):
            if p.is_file(): z.write(p,p.relative_to(src))

def main():
    shutil.rmtree(EPOCH,ignore_errors=True); EPOCH.mkdir(parents=True)
    em={'center':[LAT,LON],'crop':'2 km x 2 km','source':'Esri Landsat/PS using USGS/NASA Global Land Survey Landsat imagery','note':'Epoch label is the GLS survey epoch; acquisition date is stored separately and may fall in an adjacent calendar year. Pan-sharpened natural color at 15 m service pixel size; no AI.','epochs':[]}
    for epoch in [2000,2005,2010]:
        ds=f'GLS-{epoch}'; rec={'epoch':epoch,'dataset_id':ds,'status':'not_found'}
        try:
            rows=q_epoch(ds); print(ds,'rows',len(rows),flush=True)
            for a in rows[:10]: print(a,flush=True)
            if rows:
                def sc(a):
                    try:c=float(a.get('CloudCover')); c=c if c>=0 else 100
                    except:c=100
                    try:m=int(a.get('Month')); season=0 if 5<=m<=9 else 25
                    except:season=0
                    return c*10+season
                a=sorted(rows,key=sc)[0]; content=export_oid(a['OBJECTID']); dt=date_ms(a.get('AcquisitionDate')); sensor=str(a.get('SensorName') or 'Landsat').replace(' ','-').replace('/','-')
                n=EPOCH/f'GLS_EPOCH_{epoch}_acquired_{dt}_{sensor}_15m_native.png'; d=EPOCH/f'GLS_EPOCH_{epoch}_acquired_{dt}_{sensor}_15m_display1024.png'; n.write_bytes(content); Image.open(io.BytesIO(content)).convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS).save(d,optimize=True)
                rec.update(status='ok',acquisition_date=dt,sensor=a.get('SensorName'),object_id=a.get('OBJECTID'),cloud_cover_percent=a.get('CloudCover'),scene_id=a.get('LANDSAT_SCENE_ID'),product_id=a.get('LANDSAT_PRODUCT_ID'),files=[n.name,d.name])
        except Exception as e:rec['error']=repr(e)
        em['epochs'].append(rec)
    (EPOCH/'manifest.json').write_text(json.dumps(em,indent=2,ensure_ascii=False),encoding='utf-8'); zipdir(EPOCH,ROOT/'GLS_EPOCHS_2000_2005_2010_15m.zip')

    shutil.rmtree(FINAL,ignore_errors=True); FINAL.mkdir(parents=True)
    ps_manifest=json.loads((PS/'manifest.json').read_text(encoding='utf-8')) if (PS/'manifest.json').exists() else {'records':[]}
    psmap={r['year']:r for r in ps_manifest['records'] if r.get('status')=='ok'}
    provenance=[]
    for y in range(2000,2027):
        src=None; tier=None; meta={}
        if y<=2014 and y in psmap:
            r=psmap[y]; src=PS/r['files'][1]; tier='Landsat_PS_15m'; meta={'reference_date':r.get('reference_scene_date'),'sensor':r.get('sensor'),'resolution_m':15}
        else:
            # exact-year baseline generated previously: Landsat 30 m before 2015, Sentinel-2 10 m after 2015
            if y>=2015: matches=sorted((BASE/'images').glob(f'{y}_*_10m_2km_display1024.png'))
            else: matches=sorted((BASE/'images').glob(f'{y}_*_30m_2km_display1024.png'))
            if matches:
                src=matches[0]; tier='Sentinel2_10m' if y>=2015 else 'Landsat_exact_year_30m'; meta={'resolution_m':10 if y>=2015 else 30}
        if src and src.exists():
            dst=FINAL/f'{y}_{tier}_{src.name}'; shutil.copy2(src,dst); provenance.append({'year':y,'file':dst.name,'tier':tier,**meta})
        else: provenance.append({'year':y,'status':'missing'})
    readme={'center':[LAT,LON],'crop':'2 km x 2 km','count_expected':27,'count_files':sum(1 for x in provenance if x.get('file')),'selection':'Exact calendar year for all 27 annual files. 15 m pan-sharpened Landsat is used only when that year is available in the public service; otherwise the exact-year Landsat 30 m baseline is retained. 2015-2026 use cloud-screened Sentinel-2 10 m. GLS epoch 2000/2005/2010 references are supplied separately because an epoch image may have an acquisition date in an adjacent year.','integrity':'Real satellite imagery only; no generative AI and no AI super-resolution. 1024 display files are visual resizes only.','files':provenance}
    (FINAL/'manifest.json').write_text(json.dumps(readme,indent=2,ensure_ascii=False),encoding='utf-8')
    zipdir(FINAL,ROOT/'FINAL_27_YEARS_2000_2026_2km.zip')
    print(json.dumps(readme,indent=2),flush=True)
    for p in sorted(ROOT.glob('*.zip')):print(p,p.stat().st_size,flush=True)

if __name__=='__main__':main()
