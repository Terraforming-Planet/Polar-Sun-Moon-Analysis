# Three-source satellite forensic audit (image-first)

Center: 53.591400, 19.010717; crop 2x2 km; May.

## Critical methodology
Pixel/image content was checked first (hashes, cross-year duplicate scan, structural registration, orientation, broken/blank patterns, and optical-vs-radar lake footprint). Dates/scene IDs were evaluated only after those checks. Appearance alone cannot prove an exact calendar day; it can expose reuse, wrong crop/orientation, gross seasonal mismatch, cloud/broken imagery, or contradictions between sources.

## Machine findings
- Source1/source2 same observation (same date/platform/path-row): 21 years: [1990, 1991, 1992, 1994, 1995, 1997, 1998, 1999, 2000, 2001, 2003, 2004, 2006, 2008, 2009, 2019, 2020, 2021, 2023, 2024, 2025]
- Path/row discrepancies: [{'year': 1993, 'source1_pathrow': '190023', 'source2_pathrow': '190022'}, {'year': 2012, 'source1_pathrow': '190023', 'source2_pathrow': '190022'}, {'year': 2013, 'source1_pathrow': '190023', 'source2_pathrow': '190022'}, {'year': 2014, 'source1_pathrow': '190022', 'source2_pathrow': '190023'}]
- Weak source1/source2 image-registration years: [1993, 1995, 2002, 2005, 2007, 2010, 2011, 2012, 2013]
- Orientation-suspicious years: [2010]
- Different-year duplicate flags source1: []
- Different-year duplicate flags source2: [{'year1': 2002, 'year2': 2012, 'severity': 'FAIL', 'reason': 'exact_file_duplicate'}, {'year1': 2002, 'year2': 2013, 'severity': 'FAIL', 'reason': 'exact_file_duplicate'}, {'year1': 2012, 'year2': 2013, 'severity': 'FAIL', 'reason': 'exact_file_duplicate'}]
- Different-year duplicate flags source3: []
- Sentinel-1 acquisition/date integrity failures: []
- Optical-vs-radar lake footprint failures source1: [2023]
- Optical-vs-radar lake footprint failures source2: [2023]

## Image-first quality flags
- source1 1995: ['provider_QA_local_clear_below_0.5']; bright-neutral=0.101; local_clear(metadata after image check)=0.0
- source1 1997: ['provider_QA_local_clear_below_0.5']; bright-neutral=0.028; local_clear(metadata after image check)=0.203832
- source1 2010: ['blank_or_broken_visual_pattern', 'provider_QA_local_clear_below_0.5']; bright-neutral=0.136; local_clear(metadata after image check)=0.46685
- source2 1993: ['blank_or_broken_visual_pattern']; bright-neutral=0.000; local_clear(metadata after image check)=0.98
- source2 1995: ['provider_QA_local_clear_below_0.5']; bright-neutral=0.076; local_clear(metadata after image check)=0.18
- source2 2002: ['blank_or_broken_visual_pattern']; bright-neutral=0.000; local_clear(metadata after image check)=1.0
- source2 2010: ['provider_QA_local_clear_below_0.5']; bright-neutral=0.042; local_clear(metadata after image check)=0.44
- source2 2012: ['blank_or_broken_visual_pattern']; bright-neutral=0.000; local_clear(metadata after image check)=0.99
- source2 2013: ['blank_or_broken_visual_pattern']; bright-neutral=0.000; local_clear(metadata after image check)=0.9941
