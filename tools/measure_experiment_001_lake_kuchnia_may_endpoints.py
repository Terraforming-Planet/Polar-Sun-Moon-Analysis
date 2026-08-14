from __future__ import annotations

import json
from pathlib import Path

import measure_experiment_001_lake_kuchnia_5km_adaptive as lake

OUT=Path('experiments/experiment_001_pond_forest_kuchnia/measurements_lake_kuchnia_5km_may')
OUT.mkdir(parents=True,exist_ok=True)
# Redirect overlay output used by imported module.
lake.OUT=OUT

RECORDS=[
    {'year':1990,'date':'1990-05-02','platform':'landsat-5','item_id':'LT05_L2SP_190023_19900502_02_T1'},
    {'year':2026,'date':'2026-05-01','platform':'Sentinel-2C','item_id':'S2C_MSIL2A_20260501T095031_R079_T33UYV_20260501T132213'},
]


def main():
    rows=[lake.measure(r) for r in RECORDS]
    a,b=rows
    comp=lake.comparison(a,b)
    out={
        'experiment_id':'001','object':'Lake Kuchnia',
        'comparison':'May 1990 versus May 2026 only',
        'aoi':'5 km x 5 km around Experiment 001 center; original 2 km crop is explicitly rejected for full-lake totals because it truncates the lake',
        'method':'exact products; original L2 green/NIR/SWIR; scene-adaptive local clustering in NDWI/MNDWI space; connected main-lake component; common 30 m grid',
        'records':rows,'comparison_result':comp,
        'status':'candidate_measurement_masks_must_be_visually_validated',
        'rejected_related_result':'2026-08-07 adaptive classifier over-expanded into non-lake terrain (~1.75 km²) and is explicitly rejected for Lake Kuchnia area analysis.'
    }
    (OUT/'lake_kuchnia_may_1990_vs_2026.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf-8')
    md=['# Lake Kuchnia — May 1990 vs May 2026, 5 km AOI','','The 2 km imagery truncates the lake and is not valid for complete-lake area totals.','']
    for r in rows:md.append(f"- {r['date']} {r['platform']}: candidate mask **{r['area_m2']:.0f} m² = {r['area_ha']:.2f} ha**, one-pixel boundary range {r['boundary_low_m2']:.0f}–{r['boundary_high_m2']:.0f} m²")
    md+=['',f"Candidate difference 1990→2026: **{comp['difference_m2']:.0f} m² ({comp['difference_percent']:.2f}%)**.",'','**Do not publish this difference as final until both cyan masks are visually verified.**','', 'The August 2026 adaptive lake result is rejected because the mask expanded into non-lake terrain.']
    (OUT/'README.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
    for r in rows:print('MAY_LAKE',r['date'],r['area_m2'],r['overlay'],flush=True)
    print('MAY_COMPARISON',json.dumps(comp),flush=True)

if __name__=='__main__':main()
