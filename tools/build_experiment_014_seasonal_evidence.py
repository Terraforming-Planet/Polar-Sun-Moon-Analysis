from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

import build_experiment_011_seasonal_evidence as b

TEST = 14
LAT = 53.660000
LON = 18.790000
LAT_STR = "53.660000"
LON_STR = "18.790000"
YEARS = list(range(1990, 2027))
BRANCH = "experiment-014-wisla-gniew-grudziadz-53-660000-18-790000"
EXP = Path("experiments/experiment_014_wisla_gniew_grudziadz")
SEASONS = EXP / "seasonal_evidence"
FRAME_WIDTH_M = 45000.0
FRAME_HEIGHT_M = 70000.0
FRAME_LABEL = "45x70km"
OUTPUT_GSD_M = 30.0
TARGET_CRS = "EPSG:32634"
OBJECT = "Wisla river corridor Gniew-Grudziadz"
REPORT_STEM = "EXPERIMENT_014_REPORT.md"
TARGETS = [
    {"name": "Gniew", "lat": 53.8365, "lon": 18.8231},
    {"name": "Kwidzyn", "lat": 53.7356, "lon": 18.9313},
    {"name": "Nowe", "lat": 53.6491, "lon": 18.7272},
    {"name": "Dragacz", "lat": 53.5065, "lon": 18.7312},
    {"name": "Grudziadz", "lat": 53.4837, "lon": 18.7537},
]


def configure() -> None:
    b.TEST=TEST; b.LAT=LAT; b.LON=LON; b.LAT_STR=LAT_STR; b.LON_STR=LON_STR; b.YEARS=YEARS; b.BRANCH=BRANCH; b.EXP=EXP; b.SEASONS=SEASONS
    b.FRAME_WIDTH_M=FRAME_WIDTH_M; b.FRAME_HEIGHT_M=FRAME_HEIGHT_M; b.FRAME_LABEL=FRAME_LABEL; b.OUTPUT_GSD_M=OUTPUT_GSD_M; b.TARGET_CRS=TARGET_CRS; b.TARGETS=TARGETS


def normalize(name: str, result: dict) -> dict:
    root=SEASONS/name
    new=root/f"TEST{TEST:03d}_{name.upper()}_1990_2026_37_YEARS_{FRAME_LABEL}_{LAT_STR}_{LON_STR}.zip"
    mp=root/'manifest.json'; manifest=json.loads(mp.read_text(encoding='utf-8'))
    manifest.update({"experiment":f"Experiment {TEST:03d} - {OBJECT}","test_number":TEST,"center":{"lat":LAT,"lon":LON},"targets":TARGETS,"aoi":{"width_m":int(FRAME_WIDTH_M),"height_m":int(FRAME_HEIGHT_M),"orientation":"north_up","output_grid_m":OUTPUT_GSD_M,"crs":TARGET_CRS},"object_name":OBJECT,"zip":str(new),"source_policy":"real public satellite pixels only; USGS Landsat Collection 2 and ESA/Copernicus Sentinel-2; no generative fill or AI super-resolution","regional_mosaic_policy":{"enabled":True,"anchor_window_days":b.MOSAIC_HALF_WINDOW_DAYS,"maximum_spatial_footprints":b.MAX_MOSAIC_FOOTPRINTS,"token_refresh_on_401_403":True}})
    for rec in manifest.get('records',[]):
        if rec.get('status')=='ok':
            rec['output_grid_m']=OUTPUT_GSD_M; rec['regional_frame']=FRAME_LABEL; rec['target_crs']=TARGET_CRS
            mosaic=b._mosaic_metadata(rec)
            if mosaic: rec['regional_mosaic']=mosaic
    manifest.pop('zip_bytes',None); mp.write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
    b.m.write_contact_sheet(name,manifest); b.m.rebuild_season_zip(name,new); result.update({'zip':str(new),'zip_bytes':new.stat().st_size}); return result


def metadata() -> tuple[list[int],list[int],list[str]]:
    sm=json.loads((SEASONS/'spring'/'manifest.json').read_text()); am=json.loads((SEASONS/'autumn'/'manifest.json').read_text()); sy,ay=b.accepted_years(sm),b.accepted_years(am); plats=b.platforms(sm,am)
    policy={"experiment_id":f"{TEST:03d}","name":OBJECT,"center":{"lat":LAT,"lon":LON},"targets":TARGETS,"frame":{"width_m":int(FRAME_WIDTH_M),"height_m":int(FRAME_HEIGHT_M),"orientation":"north_up","output_grid_m":OUTPUT_GSD_M,"crs":TARGET_CRS},"years":{"start":1990,"end":2026,"count":37},"seasons":{"spring":{"preferred":5,"fallback":[4,6]},"autumn":{"preferred":9,"fallback":[10,11]}},"rules":{"real_acquisition_date_required":True,"same_footprint_every_year":True,"future_observations_never_invented":True,"autumn_2026_missing_until_observed":True,"generative_fill_forbidden":True,"ai_super_resolution_forbidden":True,"expired_sas_token_must_be_refreshed":True}}
    (EXP/'EVIDENCE_POLICY.json').write_text(json.dumps(policy,indent=2,ensure_ascii=False),encoding='utf-8')
    (EXP/'experiment.json').write_text(json.dumps({"experiment_id":f"{TEST:03d}","center":{"lat":LAT,"lon":LON},"targets":TARGETS,"frame":policy['frame'],"years":YEARS,"spring_missing_years":[y for y in YEARS if y not in sy],"autumn_missing_years":[y for y in YEARS if y not in ay],"platforms_used":plats},indent=2,ensure_ascii=False),encoding='utf-8')
    report=f"# Experiment {TEST:03d} — {OBJECT}, 1990–2026\n\n- Fixed frame: **45 km × 70 km**, north-up.\n- Center: **{LAT_STR}, {LON_STR}**.\n- Grid: **30 m/pixel**.\n- Spring: May preferred; fallback April/June.\n- Autumn: September preferred; fallback October/November.\n- Spring accepted: **{len(sy)}/37**.\n- Autumn accepted: **{len(ay)}/37**.\n- Platforms: **{', '.join(plats)}**.\n\nEvidence acquisition only. River surface/width is not discharge or volume. No generated pixels are used.\n"
    (EXP/REPORT_STEM).write_text(report,encoding='utf-8'); return sy,ay,plats


def combined_zip() -> Path:
    out=EXP/f"TEST{TEST:03d}_WISLA_GNIEW_GRUDZIADZ_1990_2026_SPRING_AUTUMN_{FRAME_LABEL}_{LAT_STR}_{LON_STR}.zip"
    if out.exists(): out.unlink()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as zf:
        for season in ('spring','autumn'):
            root=SEASONS/season
            for p in sorted(root.rglob('*')):
                if p.is_file() and p.suffix.lower()!='.zip': zf.write(p,Path(season)/p.relative_to(root))
        for extra in (REPORT_STEM,'experiment.json','EVIDENCE_POLICY.json'):
            p=EXP/extra
            if p.exists(): zf.write(p,p.name)
    return out


def main() -> None:
    configure()
    if EXP.exists(): shutil.rmtree(EXP)
    b.configure_globals(); SEASONS.mkdir(parents=True,exist_ok=True)
    normalize('spring',b.m.exp1.build_season('spring',[5,4,6])); normalize('autumn',b.m.exp1.build_season('autumn',[9,10,11]))
    sy,ay,plats=metadata(); out=combined_zip()
    summary={"experiment":TEST,"object":OBJECT,"center":{"lat":LAT,"lon":LON},"frame_width_m":int(FRAME_WIDTH_M),"frame_height_m":int(FRAME_HEIGHT_M),"output_grid_m":OUTPUT_GSD_M,"target_crs":TARGET_CRS,"regional_mosaic":True,"sas_token_refresh":True,"spring_count_ok":len(sy),"autumn_count_ok":len(ay),"spring_missing_years":[y for y in YEARS if y not in sy],"autumn_missing_years":[y for y in YEARS if y not in ay],"platforms_used":plats,"combined_zip":str(out),"combined_zip_bytes":out.stat().st_size}
    (EXP/'BUILD_SUMMARY.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False),encoding='utf-8'); print(json.dumps(summary,indent=2,ensure_ascii=False))

if __name__=='__main__': main()
