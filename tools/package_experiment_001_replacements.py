from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path

YEARS=[1993,1995,2002,2010,2012,2013]
EXP=Path('experiments/experiment_001_pond_forest_kuchnia')
SPRING=EXP/'seasonal_evidence'/'spring'
OUT=EXP/'corrections'/'replacement_set_for_rejected_optical_years'
IMG=OUT/'images'


def main():
    man=json.loads((SPRING/'manifest.json').read_text(encoding='utf-8'))
    by={int(r['year']):r for r in man['records'] if r.get('status')=='ok'}
    IMG.mkdir(parents=True,exist_ok=True)
    rows=[]; seen={}
    for y in YEARS:
        if y not in by: raise RuntimeError(f'missing corrected spring year {y}')
        r=by[y]
        copied=[]
        for fn in r['files']:
            src=SPRING/'images'/fn; dst=IMG/fn
            shutil.copy2(src,dst); copied.append(dst.name)
        native=IMG/r['files'][0]; sha=hashlib.sha256(native.read_bytes()).hexdigest()
        if sha in seen: raise RuntimeError(f'duplicate replacement {y} == {seen[sha]}')
        seen[sha]=y
        rows.append({
            'year':y,'replacement_date':r.get('date'),'platform':r.get('platform'),
            'native_resolution_m':r.get('native_resolution_m'),'selected_month':r.get('selected_month'),
            'is_fallback_month':r.get('is_fallback_month'),'selection_quality_score':r.get('selection_quality_score'),
            'source_item_id':r.get('item_id'),'sha256_native':sha,'files':copied,
            'replacement_status':'verified_by_corrected_spring_integrity_gate',
        })
    manifest={
        'experiment_id':'001',
        'purpose':'Explicit replacement images for years rejected/reviewed by the image-first forensic audit. Original suspect files remain preserved under errors/do_wyjasnienia and in original packages.',
        'replaced_years':YEARS,
        'records':rows,
        'no_silent_overwrite':True,
    }
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
    z=OUT/'EXPERIMENT_001_REPLACEMENTS_1993_1995_2002_2010_2012_2013.zip'
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as zf:
        for p in sorted(OUT.rglob('*')):
            if p.is_file() and p!=z: zf.write(p,p.relative_to(OUT))
    print('REPLACEMENTS',json.dumps(rows,ensure_ascii=False))
    print('ZIP',z,z.stat().st_size)

if __name__=='__main__':main()
