from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

import build_experiment_001_seasonal_evidence as seasonal

YEAR=2026
MONTH=8
ROOT=Path('experiments/experiment_001_pond_forest_kuchnia/seasonal_evidence/late_summer_2026_proxy')
IMG=ROOT/'images'
ROOT.mkdir(parents=True,exist_ok=True); IMG.mkdir(parents=True,exist_ok=True)


def main():
    seasonal.base.ROOT=ROOT
    seasonal.base.IMG_DIR=IMG
    candidates=seasonal.choose_month(YEAR,MONTH,allow_sentinel=True)
    selected=None; rejected=[]
    for kind,item,meta,score in candidates[:5]:
        try:
            rec=seasonal.render(YEAR,kind,item,meta)
            native=IMG/rec['files'][0]
            integ=seasonal.image_integrity(native)
            if integ['broken_visual']:
                raise RuntimeError('image-first visual integrity failed')
            rec.update({
                'requested_context':'late_summer_2026_proxy_for_future_autumn_gap',
                'selected_month':MONTH,
                'selected_month_name':'August',
                'is_autumn_observation':False,
                'must_not_be_used_as_autumn_2026':True,
                'reason':'September-November 2026 had not occurred as of 2026-08-14; user allowed another month if explicitly documented.',
                'selection_quality_score':round(float(score),6),
                'image_integrity':integ,
            })
            selected=rec
            break
        except Exception as exc:
            rejected.append({'item_id':item.get('id'),'error':repr(exc),'score':score})
    if not selected:
        raise RuntimeError(f'No usable August 2026 proxy. Rejected: {rejected}')
    manifest={
        'experiment_id':'001',
        'year':YEAR,
        'role':'late_summer_proxy_only_not_autumn',
        'observation':selected,
        'rejected_candidates':rejected,
        'integrity_policy':'real official/public pixels; image-first check; no AI filling/super-resolution',
    }
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
    z=ROOT/'EXPERIMENT_001_2026_AUGUST_LATE_SUMMER_PROXY_2km_53.591400_19.010717.zip'
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as zf:
        for p in sorted(ROOT.rglob('*')):
            if p.is_file() and p!=z:
                zf.write(p,p.relative_to(ROOT))
    print('SELECTED',json.dumps(selected,ensure_ascii=False))
    print('ZIP',z,z.stat().st_size)

if __name__=='__main__':main()
