from __future__ import annotations

import numpy as np

import measure_experiment_001_seasonal_water_v3 as m

RECORDS=[
    {'year':1990,'date':'1990-05-02','platform':'landsat-5','item_id':'LT05_L2SP_190023_19900502_02_T1'},
    {'year':2026,'date':'2026-05-01','platform':'Sentinel-2C','item_id':'S2C_MSIL2A_20260501T095031_R079_T33UYV_20260501T132213'},
    {'year':2026,'date':'2026-08-07','platform':'Sentinel-2B','item_id':'S2B_MSIL2A_20260807T100029_R122_T33UYV_20260807T135548'},
]


def val(a,r,c):
    v=a[r,c]
    return None if not np.isfinite(v) else float(v)


def main():
    for rec in RECORDS:
        item=m.l2_item(rec)
        gk=m._band_key(item,'green'); nk=m._band_key(item,'nir'); sk=m._band_key(item,'swir1')
        g=m.base.read(item,gk); n=m.base.read(item,nk); s=m.base.read(item,sk); clear=m.base.clear_mask(item,g.shape)
        ndwi,mndwi,_=m.water_indices(item)
        print('\n===',rec['date'],rec['platform'],item['id'],'===')
        print('BANDS',gk,nk,sk,'shape',g.shape,'LAKE seed lonlat',m.LAKE_LON,m.LAKE_LAT,'POND',m.POND_LON,m.POND_LAT)
        for name,x,y in [
            ('lake_seed',m.LAKE_X,m.LAKE_Y),
            ('pond_seed',m.POND_X,m.POND_Y),
            ('lake_west',m.base.CX+150,m.base.CY-40),
            ('lake_east',m.base.CX+650,m.base.CY-150),
            ('lake_south',m.base.CX+600,m.base.CY-450),
        ]:
            r,c=m.base.rc_for(x,y,g.shape)
            print(name,'rc',r,c,'clear',bool(clear[r,c]),'green',val(g,r,c),'nir',val(n,r,c),'swir1',val(s,r,c),'ndwi',val(ndwi,r,c),'mndwi',val(mndwi,r,c))
        pond_roi,lake_roi=m.base.rois(g.shape)
        for name,roi in [('lake_roi',lake_roi),('pond_roi',pond_roi)]:
            v=mndwi[roi & clear & np.isfinite(mndwi)]
            d=ndwi[roi & clear & np.isfinite(ndwi)]
            print(name,'pixels',v.size,'mndwi pct',np.percentile(v,[0,5,25,50,75,95,100]).tolist() if v.size else None,'ndwi pct',np.percentile(d,[0,5,25,50,75,95,100]).tolist() if d.size else None)
            if v.size:
                candidate=roi & clear & np.isfinite(mndwi) & np.isfinite(ndwi) & (mndwi>0.05) & (ndwi>-0.08)
                labels,num=m.base.ndimage.label(candidate,structure=np.ones((3,3),np.uint8))
                sizes=m.base.ndimage.sum(candidate,labels,range(1,num+1)) if num else []
                top=sorted([int(x) for x in sizes],reverse=True)[:10] if num else []
                print(name,'candidate pixels',int(candidate.sum()),'components',num,'top_component_pixels',top,'top_component_m2',[x*900 for x in top])

if __name__=='__main__':main()
