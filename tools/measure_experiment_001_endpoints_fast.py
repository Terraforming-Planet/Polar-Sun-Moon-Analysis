from __future__ import annotations

import json
from pathlib import Path

import measure_experiment_001_seasonal_water_v3 as m

OUT=Path('experiments/experiment_001_pond_forest_kuchnia/measurements_endpoint_fast')
OUT.mkdir(parents=True,exist_ok=True)

# Exact products already used by the verified evidence imagery.  A date-only
# lookup is intentionally forbidden here because neighbouring paths/tiles overlap.
RECORDS=[
    {
        'season':'spring','year':1990,'date':'1990-05-02','platform':'landsat-5',
        'item_id':'LT05_L2SP_190023_19900502_02_T1',
        'native_resolution_m':30,'selected_month':5,'is_fallback_month':False,
    },
    {
        'season':'spring','year':2026,'date':'2026-05-01','platform':'Sentinel-2C',
        'item_id':'S2C_MSIL2A_20260501T095031_R079_T33UYV_20260501T132213',
        'native_resolution_m':10,'selected_month':5,'is_fallback_month':False,
    },
    {
        'season':'late_summer_proxy','year':2026,'date':'2026-08-07','platform':'Sentinel-2B',
        'item_id':'S2B_MSIL2A_20260807T100029_R122_T33UYV_20260807T135548',
        'native_resolution_m':10,'selected_month':8,'is_fallback_month':False,
    },
]


def compact(r):
    return {
        'season':r['season'],'year':r['year'],'date':r['date'],'platform':r['platform'],
        'confidence':r['confidence'],'clear_fraction_measurement_aoi':r['clear_fraction_measurement_aoi'],
        'forest_pond':r['forest_pond'],'lake_kuchnia':r['lake_kuchnia'],
        'measurement_item_id':r['measurement_item_id'],'measurement_collection':r['measurement_collection'],
        'pond_geometry_status':r['pond_geometry_status'],'overlay':r['overlay'],
    }


def comparison(a,b,obj):
    aa=float(a[obj]['area_m2']); bb=float(b[obj]['area_m2']); loss=aa-bb
    return {
        'object':obj,'from':f"{a['date']} ({a['platform']})",'to':f"{b['date']} ({b['platform']})",
        'from_area_m2':aa,'to_area_m2':bb,'difference_m2':loss,'difference_ha':loss/10000.0,
        'loss_percent':(loss/aa*100.0 if aa>0 else None),
        'from_uncertainty_m2':[a[obj]['low_m2'],a[obj]['high_m2']],
        'to_uncertainty_m2':[b[obj]['low_m2'],b[obj]['high_m2']],
        'status':'preliminary_common30m_exact-product endpoint measurement; manual mask/polygon validation required'
    }


def main():
    rows=[]
    for rec in RECORDS:
        r=m.analyze_record(rec['season'],rec); rows.append(compact(r))
        assert r['measurement_item_id'] == rec['item_id'], (rec['item_id'],r['measurement_item_id'])
        print('ENDPOINT',rec['season'],rec['date'],r['measurement_item_id'],'pond',r['forest_pond']['area_m2'],'lake',r['lake_kuchnia']['area_m2'],'confidence',r['confidence'],flush=True)

    spring90=next(r for r in rows if r['season']=='spring' and r['year']==1990)
    spring26=next(r for r in rows if r['season']=='spring' and r['year']==2026)
    late26=next(r for r in rows if r['season']=='late_summer_proxy')

    # Sanity gate: Lake Kuchnia is plainly visible in all three exact source images.
    # A result near zero means the spectral/product selection is broken and MUST fail CI.
    for r in (spring90,spring26,late26):
        if not (100000 <= float(r['lake_kuchnia']['high_m2']) <= 1000000):
            raise RuntimeError(f"Lake Kuchnia sanity check failed for {r['date']}: {r['lake_kuchnia']}")

    comps=[
        comparison(spring90,spring26,'forest_pond'),
        comparison(spring90,spring26,'lake_kuchnia'),
        comparison(spring90,late26,'forest_pond'),
        comparison(spring90,late26,'lake_kuchnia'),
    ]
    out={
        'experiment_id':'001','measurement_grid_m':30,
        'pond_seed_corrected':{'lat':m.POND_LAT,'lon':m.POND_LON,'west_offset_m':690,'north_offset_m':375},
        'exact_product_selection_required':True,
        'records':rows,'comparisons':comps,
        'interpretation_rule':'Do not promote pond area to CONFIRMED until masks are visually checked and the pond polygon/basin geometry is manually verified. If strict MNDWI does not classify the forest pond, report that limitation instead of forcing a water mask.',
        'previous_working_estimate':{'loss_m2':25000,'loss_ha':2.5,'loss_percent':'near 100%','status':'provisional visual estimate; not overwritten by a failed spectral classifier'},
    }
    (OUT/'endpoint_measurement_1990_2026.json').write_text(json.dumps(out,indent=2,ensure_ascii=False),encoding='utf-8')
    md=['# Experiment 001 — exact-product endpoint measurement','','Common grid: **30 m**. Original L2 spectral bands, MNDWI/NDWI. Exact source product IDs. Corrected forest-pond seed.','', '**Scientific gate:** a zero/implausible Lake Kuchnia result fails CI; a zero pond result is not automatically interpreted as absence because the forested pond may not be reliably separable by strict MNDWI at 30 m.','']
    for c in comps:
        md += [f"## {c['object']}: {c['from']} → {c['to']}",f"- start: **{c['from_area_m2']:.0f} m²**",f"- end: **{c['to_area_m2']:.0f} m²**",f"- difference: **{c['difference_m2']:.0f} m² = {c['difference_ha']:.3f} ha**",f"- loss percentage: **{c['loss_percent']:.2f}%**" if c['loss_percent'] is not None else '- loss percentage: unavailable / classifier did not produce a usable start area','- status: **PRELIMINARY / manual mask validation required**','']
    (OUT/'README.md').write_text('\n'.join(md),encoding='utf-8')
    print('COMPARISONS',json.dumps(comps,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
