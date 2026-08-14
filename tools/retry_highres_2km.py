from __future__ import annotations

import json, re, shutil, zipfile
from datetime import datetime
import numpy as np
import pystac_client
from PIL import Image

import build_highres_landsat_alos_2km as b


def norm(v):
    return re.sub(r'[^a-z0-9]', '', str(v).lower())


def build_usgs_pan():
    d=b.ROOT/'USGS_Landsat_Level1_PAN15m'; shutil.rmtree(d,ignore_errors=True); d.mkdir()
    man={'source':'USGS EROS Landsat Collection 2 Level-1 STAC','center':[b.LAT,b.LON],'crop':'2 km x 2 km','years':[],'note':'Native 15 m panchromatic Band 8 where available; pansharpened color uses only real RGB+PAN pixels, no AI.'}
    cat=pystac_client.Client.open(b.USGS)
    prefs={2000:'landsat7',2015:'landsat8',2020:'landsat8',2026:'landsat9'}
    for y,plat in prefs.items():
        rec={'year':y,'status':'not_found'}
        try:items=list(cat.search(collections=['landsat-c2l1'],bbox=b.BBOX,datetime=f'{y}-01-01/{y}-12-31',limit=100).items())
        except Exception as e:rec['search_error']=repr(e);man['years'].append(rec);continue
        rec['platforms_seen']=sorted(set(str(i.properties.get('platform','')) for i in items))
        items=[i for i in items if norm(i.properties.get('platform',''))==plat]
        for i in b.rank(items,y)[:20]:
            pk=b.key(i,['pan','panchromatic','B8','band8'])
            if not pk:continue
            try:
                pan=b.read(i,pk,15,sign=False,nearest=True);vf=float(np.mean(np.isfinite(pan)))
                print('PAN retry',y,i.id,i.properties.get('platform'),pk,vf,flush=True)
                if vf<.95:continue
                dt=b.dte(i);base=f'{y}_{dt}_{plat}';pp=d/f'{base}_PAN15m_2km.png';b.save_gray(pan,pp);files=[pp.name]
                rk=b.key(i,['red']);gk=b.key(i,['green']);bk=b.key(i,['blue'])
                if all([rk,gk,bk]):
                    r=b.read(i,rk,15);g=b.read(i,gk,15);bl=b.read(i,bk,15)
                    sr,sg,sb,sp=map(b.stretch,[r,g,bl,pan]);q=sp/((sr+sg+sb)/3+1e-4)
                    out=np.stack([np.clip(sr*q,0,1),np.clip(sg*q,0,1),np.clip(sb*q,0,1)],-1)
                    pc=d/f'{base}_RGB_PANSHARP15m_2km.png';Image.fromarray(np.rint(out*255).astype(np.uint8),'RGB').save(pc,optimize=True);files.append(pc.name)
                rec.update(status='ok',date=dt,item_id=i.id,platform=i.properties.get('platform'),cloud=b.cloud(i),valid_fraction=round(vf,6),files=files);break
            except Exception as e:rec['read_error']=repr(e)
        man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');b.zpack(d,'USGS_Landsat_Level1_PAN15m_2km.zip')


def build_alos():
    d=b.ROOT/'JAXA_ALOS_PALSAR';d.mkdir(exist_ok=True)
    man={'source':'JAXA ALOS/ALOS-2 PALSAR Annual Mosaic via Microsoft Planetary Computer','collection':'alos-palsar-mosaic','center':[b.LAT,b.LON],'crop':'2 km x 2 km','years':[],'note':'Anonymous read retry of real JAXA annual SAR mosaics; no AI.'}
    cat=pystac_client.Client.open(b.PC)
    try:items=list(cat.search(collections=['alos-palsar-mosaic'],bbox=b.BBOX,limit=500).items())
    except Exception as e:man['error']=repr(e);items=[]
    man['inventory_sample']=[{'id':i.id,'year':b.parse_year(i),'datetime':b.dte(i),'assets':list(i.assets)} for i in items[:50]]
    for y in [2010,2015,2020]:
        rec={'year':y,'status':'not_found'}
        for i in [x for x in items if b.parse_year(x)==y]:
            hk=b.key(i,['hh','HH'])
            if not hk:continue
            try:
                a=b.read(i,hk,25,sign=False,nearest=True);vf=float(np.mean(np.isfinite(a)))
                print('ALOS anonymous',y,i.id,hk,vf,flush=True)
                if vf<.95:continue
                dt=b.dte(i) or str(y);pg=d/f'{y}_{dt}_JAXA_ALOS_PALSAR_HH25m_2km.png';b.save_gray(a,pg,True);files=[pg.name]
                vk=b.key(i,['hv','HV'])
                if vk:
                    hv=b.read(i,vk,25,sign=False,nearest=True);sh=b.stretch(np.where(a>0,10*np.log10(a),np.nan),1,99);sv=b.stretch(np.where(hv>0,10*np.log10(hv),np.nan),1,99);comp=np.stack([sh,sv,np.clip(sh-sv+.5,0,1)],-1);pr=d/f'{y}_{dt}_JAXA_ALOS_PALSAR_HH_HV25m_2km.png';Image.fromarray(np.rint(comp*255).astype(np.uint8),'RGB').save(pr,optimize=True);files.append(pr.name)
                rec.update(status='ok',date=dt,item_id=i.id,valid_fraction=round(vf,6),files=files);break
            except Exception as e:rec['read_error']=repr(e)
        man['years'].append(rec)
    (d/'manifest.json').write_text(json.dumps(man,indent=2),encoding='utf-8');b.zpack(d,'JAXA_ALOS_PALSAR_2km.zip')


def allzip():
    z=b.ROOT/'ALL_SATELLITES_2km.zip'
    if z.exists():z.unlink()
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as f:
        for p in sorted(b.ROOT.rglob('*')):
            if p.is_file() and p!=z and not p.name.endswith('.zip'):f.write(p,p.relative_to(b.ROOT))

if __name__=='__main__':
    build_usgs_pan();build_alos();allzip()
    for p in sorted(b.ROOT.rglob('*')):
        if p.is_file():print(p,p.stat().st_size,flush=True)
