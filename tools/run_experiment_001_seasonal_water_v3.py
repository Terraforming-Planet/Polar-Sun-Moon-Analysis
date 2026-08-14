from __future__ import annotations

import csv
import json
from pathlib import Path

import measure_experiment_001_seasonal_water_v3 as m

EXP = Path('experiments/experiment_001_pond_forest_kuchnia')
OUT = EXP / 'measurements'
OUT.mkdir(parents=True, exist_ok=True)


def sanity(record: dict) -> list[str]:
    warnings=[]
    lake=record['lake_kuchnia']
    if float(lake['high_m2']) < 100000:
        warnings.append('lake_kuchnia_mask_implausibly_small_review_required')
    if float(lake['low_m2']) > 1000000:
        warnings.append('lake_kuchnia_mask_implausibly_large_review_required')
    if float(record['clear_fraction_measurement_aoi']) < 0.80:
        warnings.append('low_clear_fraction_measurement_aoi')
    if float(record['forest_pond']['area_m2']) == 0:
        warnings.append('strict_spectral_classifier_found_no_connected_open_water_at_forest_pond_seed_do_not_interpret_as_proof_of_absence')
    return warnings


def endpoint(rows: list[dict], season: str, obj: str) -> dict | None:
    by={r['year']:r for r in rows if r['season']==season and not r.get('measurement_sanity_warnings')}
    if 1990 not in by or 2026 not in by:
        return None
    a=float(by[1990][obj]['area_m2']); b=float(by[2026][obj]['area_m2'])
    if obj=='forest_pond' and (a <= 0 or b < 0):
        return {
            'season':season,'object':obj,'status':'not_quantifiable_by_current_strict_spectral_classifier',
            'area_1990_m2':a,'area_2026_m2':b,
            'reason':'Current connected MNDWI/NDWI classifier did not produce a valid historical start area. Do not force a percentage; use manually verified basin polygon / visible-water workflow.'
        }
    loss=a-b
    return {
        'season':season,'object':obj,
        'area_1990_m2':a,'area_2026_m2':b,
        'loss_1990_to_2026_m2':loss,'loss_ha':loss/10000.0,
        'loss_percent':loss/a*100.0 if a>0 else None,
        '1990_uncertainty_m2':[by[1990][obj]['low_m2'],by[1990][obj]['high_m2']],
        '2026_uncertainty_m2':[by[2026][obj]['low_m2'],by[2026][obj]['high_m2']],
        'status':'preliminary_exact-product_common30m_measurement_manual_mask_validation_required'
    }


def main() -> None:
    rows=[]; failures=[]
    for season in ('spring','autumn'):
        manifest=json.loads((EXP/'seasonal_evidence'/season/'manifest.json').read_text(encoding='utf-8'))
        for rec in manifest['records']:
            if rec.get('status')!='ok':
                continue
            try:
                result=m.analyze_record(season,rec)
                target_id=rec.get('item_id') or rec.get('source_item_id') or rec.get('catalog_item_id')
                if target_id and result['measurement_item_id'] != target_id:
                    raise RuntimeError(f"exact product mismatch expected={target_id} got={result['measurement_item_id']}")
                result['source_manifest_item_id']=target_id
                result['measurement_sanity_warnings']=sanity(result)
                rows.append(result)
                print('MEASURED',season,rec['year'],result['measurement_item_id'],'pond',result['forest_pond']['area_m2'],'lake',result['lake_kuchnia']['area_m2'],'warnings',result['measurement_sanity_warnings'],flush=True)
            except Exception as exc:
                failures.append({'season':season,'year':rec.get('year'),'date':rec.get('date'),'item_id':rec.get('item_id'),'error':repr(exc)})
                print('FAILED',season,rec.get('year'),rec.get('item_id'),repr(exc),flush=True)

    endpoints=[]
    for season in ('spring','autumn'):
        for obj in ('forest_pond','lake_kuchnia'):
            e=endpoint(rows,season,obj)
            if e: endpoints.append(e)

    output={
        'experiment_id':'001',
        'method':'Exact manifest product IDs; original L2 spectral bands; MNDWI+NDWI; common 30 m grid; threshold sensitivity plus boundary uncertainty.',
        'aoi_center':{'lat':m.LAT,'lon':m.LON},
        'pond_seed':{'lat':m.POND_LAT,'lon':m.POND_LON,'offset_from_aoi_center_m':{'west':690,'north':375},'status':'image-first corrected seed; final polygon boundary still requires manual verification'},
        'exact_product_selection_required':True,
        'records':rows,
        'endpoint_comparisons':endpoints,
        'failures':failures,
        'interpretation':'A strict spectral zero at the small forest pond is not automatically evidence of physical absence, especially under canopy/mixed 30m pixels. The working ~2.5 ha visual-footprint estimate remains provisional until a manually verified basin polygon workflow is completed.'
    }
    (OUT/'seasonal_water_measurements.json').write_text(json.dumps(output,indent=2,ensure_ascii=False),encoding='utf-8')
    (OUT/'endpoint_1990_vs_2026.json').write_text(json.dumps(endpoints,indent=2,ensure_ascii=False),encoding='utf-8')

    fields=['season','year','date','platform','source_manifest_item_id','measurement_item_id','selected_month','fallback_month','confidence','clear_fraction_measurement_aoi','pond_area_m2','pond_low_m2','pond_high_m2','lake_area_m2','lake_low_m2','lake_high_m2','sanity_warnings']
    with (OUT/'seasonal_water_measurements.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader()
        for r in rows:
            w.writerow({
                'season':r['season'],'year':r['year'],'date':r['date'],'platform':r['platform'],
                'source_manifest_item_id':r.get('source_manifest_item_id'),'measurement_item_id':r.get('measurement_item_id'),
                'selected_month':r.get('selected_month'),'fallback_month':r.get('fallback_month'),
                'confidence':r['confidence'],'clear_fraction_measurement_aoi':r['clear_fraction_measurement_aoi'],
                'pond_area_m2':r['forest_pond']['area_m2'],'pond_low_m2':r['forest_pond']['low_m2'],'pond_high_m2':r['forest_pond']['high_m2'],
                'lake_area_m2':r['lake_kuchnia']['area_m2'],'lake_low_m2':r['lake_kuchnia']['low_m2'],'lake_high_m2':r['lake_kuchnia']['high_m2'],
                'sanity_warnings':'|'.join(r.get('measurement_sanity_warnings',[])),
            })

    summary=['# Experiment 001 — seasonal spectral measurement v3','', '**Exact product IDs are mandatory.** Cross-era measurement grid: **30 m**.','',f'Measured records: **{len(rows)}**. Failures: **{len(failures)}**.','', '## Endpoint status']
    for e in endpoints:
        summary.append(f"- {e['season']} / {e['object']}: `{e['status']}` — 1990={e.get('area_1990_m2')} m², 2026={e.get('area_2026_m2')} m², loss={e.get('loss_1990_to_2026_m2')} m², percent={e.get('loss_percent')}")
    summary += ['', 'The forest-pond numerical result is not promoted to CONFIRMED if the strict spectral classifier cannot recover a valid historical open-water start area. A manually verified basin/visible-water polygon measurement is the next gate.']
    (OUT/'README.md').write_text('\n'.join(summary)+'\n',encoding='utf-8')
    print('ENDPOINTS',json.dumps(endpoints,ensure_ascii=False),flush=True)
    print('FAILURES',len(failures),flush=True)

if __name__=='__main__':
    main()
