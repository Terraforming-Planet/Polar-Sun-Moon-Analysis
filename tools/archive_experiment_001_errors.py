from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

EXP = Path('experiments/experiment_001_pond_forest_kuchnia')
ERRORS = EXP / 'errors' / 'do_wyjasnienia'
PRIMARY = Path('satellite_may_1990_2026/53.591400_19.010717')
ALT = Path('satellite_alternate_source_may_1990_2025/53.591400_19.010717')

REVIEW = {
    'source1': {
        1995: 'Provider/local QA reports effectively unusable local clear fraction for quantitative water measurement.',
        1997: 'Image itself agrees across delivery paths, but local QA values strongly disagree; preserve for QA/provenance review.',
        2010: 'Image-first forensic audit flagged broken/blank visual pattern and low local clear fraction.',
    },
    'source2': {
        1993: 'Image-first audit flagged broken/blank visual pattern and Landsat path/row conflict.',
        1995: 'Low local clear fraction; unsuitable for quantitative water measurement.',
        2002: 'Exact byte-for-byte cross-year duplicate in generated alternate pack (same file as 2012 and 2013).',
        2010: 'Low local clear fraction; retain only for review.',
        2012: 'Exact byte-for-byte cross-year duplicate in generated alternate pack (same file as 2002 and 2013).',
        2013: 'Exact byte-for-byte cross-year duplicate in generated alternate pack (same file as 2002 and 2012).',
    },
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    records=[]
    for source, years in REVIEW.items():
        root = PRIMARY if source == 'source1' else ALT
        out = ERRORS/source
        out.mkdir(parents=True,exist_ok=True)
        for year, reason in years.items():
            matches=sorted((root/'images').glob(f'{year}_*'))
            if not matches:
                records.append({'source':source,'year':year,'reason':reason,'status':'file_not_found'})
                continue
            for src in matches:
                dst=out/src.name
                shutil.copy2(src,dst)
                records.append({'source':source,'year':year,'reason':reason,'original_path':str(src),'archived_copy':str(dst),'sha256':sha(src),'status':'archived_copy_original_preserved'})
    ERRORS.mkdir(parents=True,exist_ok=True)
    (ERRORS/'rejected_images_manifest.json').write_text(json.dumps(records,indent=2,ensure_ascii=False),encoding='utf-8')
    readme=['# Błędy / do wyjaśnienia — Experiment 001','', 'Te obrazy nie są kasowane. Są zachowane jako kopie audytowe wraz z SHA-256 i powodem odrzucenia/review. Oryginały pozostają w źródłowych paczkach.', '', '## Zasada', '', '- plik w tym folderze nie może być użyty jako ilościowy dowód powierzchni wody bez ponownej weryfikacji;', '- znalezienie błędu w naszej paczce nie jest dowodem fałszowania danych przez operatora satelity;', '- exact cross-year duplicate jest błędem pipeline/paczki i wymaga ponownego pobrania sceny.', '', f'Liczba zapisów audytowych: **{len(records)}**']
    (ERRORS/'README.md').write_text('\n'.join(readme)+'\n',encoding='utf-8')
    print('ARCHIVED_RECORDS',len(records))
    for r in records: print(r['source'],r['year'],r['status'],r.get('archived_copy',''))

if __name__=='__main__': main()
