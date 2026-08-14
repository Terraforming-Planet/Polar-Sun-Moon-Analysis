from __future__ import annotations

import json
import math
import time
from datetime import datetime
from pathlib import Path

import requests

LAT=53.591400
LON=19.010717
YEARS=range(2000,2027)
OUT=Path('experiments/experiment_001_pond_forest_kuchnia/source4/nasa_aster')
OUT.mkdir(parents=True,exist_ok=True)
CMR='https://cmr.earthdata.nasa.gov/search/granules.json'
SESSION=requests.Session(); SESSION.headers.update({'User-Agent':'Terraforming-Planet-TerraWater-Experiment-001/1.0','Client-Id':'Terraforming-Planet'})


def query(start,end):
    params={
        'short_name':'AST_L1T',
        'version':'004',
        'bounding_box':f'{LON-0.03},{LAT-0.025},{LON+0.03},{LAT+0.025}',
        'temporal':f'{start}T00:00:00Z,{end}T23:59:59Z',
        'page_size':100,
    }
    last=None
    for attempt in range(6):
        r=SESSION.get(CMR,params=params,timeout=90); last=r
        if r.status_code not in (429,500,502,503,504):
            r.raise_for_status(); return r.json().get('feed',{}).get('entry',[])
        time.sleep(min(20,2**attempt))
    last.raise_for_status()


def normalize(entry):
    links=[]
    for l in entry.get('links',[]) or []:
        href=l.get('href')
        if href:
            links.append({'href':href,'rel':l.get('rel'),'type':l.get('type'),'title':l.get('title')})
    return {
        'granule_id':entry.get('id'),
        'title':entry.get('title'),
        'time_start':entry.get('time_start'),
        'time_end':entry.get('time_end'),
        'producer_granule_id':entry.get('producer_granule_id'),
        'browse_or_download_links':links,
    }


def choose(entries,target):
    if not entries:return None
    td=datetime.fromisoformat(target)
    def dist(e):
        try:return abs((datetime.fromisoformat(str(e.get('time_start',''))[:10])-td).days)
        except Exception:return 99999
    return min(entries,key=dist)


def main():
    result={
        'experiment_id':'001',
        'source_family':'NASA ASTER / Terra',
        'official_catalog':'NASA Earthdata CMR',
        'cmr_endpoint':CMR,
        'collection_short_name':'AST_L1T',
        'collection_version':'004',
        'aoi':{'lat':LAT,'lon':LON},
        'purpose':'fourth independent sensor catalog; catalog presence is not yet quantitative evidence until the granule pixels are downloaded and validated',
        'years':[],
    }
    total=0
    for year in YEARS:
        spring_raw=query(f'{year}-04-01',f'{year}-06-30')
        autumn_raw=query(f'{year}-09-01',f'{year}-11-30')
        spring=[normalize(e) for e in spring_raw]; autumn=[normalize(e) for e in autumn_raw]
        total+=len(spring)+len(autumn)
        row={
            'year':year,
            'spring_count':len(spring),
            'autumn_count':len(autumn),
            'spring_best_near_may15':choose(spring,f'{year}-05-15'),
            'autumn_best_near_sep15':choose(autumn,f'{year}-09-15'),
            'spring_granules':spring,
            'autumn_granules':autumn,
        }
        result['years'].append(row)
        print('ASTER',year,'spring',len(spring),'autumn',len(autumn),flush=True)
    result['total_catalog_hits']=total
    result['years_with_spring_scene']=[r['year'] for r in result['years'] if r['spring_count']]
    result['years_with_autumn_scene']=[r['year'] for r in result['years'] if r['autumn_count']]
    result['admission_status']='catalog_verified_only_pixels_not_yet_admitted'
    (OUT/'nasa_aster_scene_catalog.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    summary=['# NASA ASTER scene catalog — Experiment 001','',f'AOI: {LAT:.6f}, {LON:.6f}','',f'Total CMR granule hits across spring/autumn queries: **{total}**','',f'Years with spring ASTER scene(s): {result["years_with_spring_scene"]}', '', f'Years with autumn ASTER scene(s): {result["years_with_autumn_scene"]}', '', 'Status: **catalog verified only**. A scene becomes evidence only after official pixel download, crop verification, date/product validation and SHA integrity checks.']
    (OUT/'README.md').write_text('\n'.join(summary)+'\n',encoding='utf-8')
    print('TOTAL',total,flush=True)

if __name__=='__main__':main()
