"""Exact ESA L1C TCI RGB, selected in GEE and read from the public Sentinel bucket.
No arbitrary reflectance stretch or screenshot substitutes for Satlas's input.
"""
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

def tci_url(product_id, mgrs):
    import re
    import requests
    if not re.fullmatch(r'S2[ABCD]_MSIL1C_[A-Z0-9_]+', product_id) or not re.fullmatch(r'[0-9]{2}[A-Z]{3}',mgrs):
        raise ValueError('Unexpected Sentinel-2 product/MGRS identity.')
    prefix = 'tiles/'+mgrs[:2]+'/'+mgrs[2]+'/'+mgrs[3:]+'/'+product_id+'.SAFE/GRANULE/'
    names, token = [], None
    while True:
        params = {'prefix':prefix,'fields':'items(name),nextPageToken','maxResults':1000}
        if token: params['pageToken'] = token
        r = requests.get('https://storage.googleapis.com/storage/v1/b/gcp-public-data-sentinel-2/o',params=params,timeout=60)
        r.raise_for_status()
        body = r.json()
        names.extend(x['name'] for x in body.get('items',[]) if x['name'].endswith('_TCI.jp2'))
        token = body.get('nextPageToken')
        if not token: break
    if len(names) != 1:
        raise ValueError('Expected one original L1C TCI object; found '+str(len(names))+'. No approximate fallback.')
    return 'https://storage.googleapis.com/gcp-public-data-sentinel-2/'+quote(names[0],safe='/')

def fetch_chip(feature, site, cache):
    import ee
    import numpy as np
    import rasterio
    from rasterio import Affine
    from rasterio.vrt import WarpedVRT
    from rasterio.warp import transform
    point = ee.Geometry(feature['geometry'])
    # Frozen annual target; choose least cloudy available single observation, not a stretched annual composite.
    scenes = (ee.ImageCollection('COPERNICUS/S2_HARMONIZED').filterBounds(point)
              .filterDate('2021-01-01','2022-01-01').filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE',20))
              .sort('CLOUDY_PIXEL_PERCENTAGE').limit(6))
    ids = scenes.aggregate_array('system:index').getInfo()
    if not ids:
        raise ValueError('No eligible 2021 L1C scenes at '+feature['properties']['sample_id'])
    lon, lat = feature['geometry']['coordinates']
    xs, ys = transform('EPSG:4326', site['crs'], [lon],[lat])
    affine = Affine(10,0,xs[0]-2565,0,-10,ys[0]+2565)
    cache = Path(cache); cache.mkdir(parents=True,exist_ok=True)
    failures = []
    for scene_id in ids:
        try:
            scene = ee.Image('COPERNICUS/S2_HARMONIZED/'+scene_id)
            meta = scene.toDictionary(['PRODUCT_ID','MGRS_TILE','system:time_start','CLOUDY_PIXEL_PERCENTAGE']).getInfo()
            # QA60 is available for this fixed 2021 baseline. Check scene-specific central pixel cloud/cirrus.
            qa = scene.select('QA60').unmask(65535).reduceRegion(ee.Reducer.first(),point,60).getInfo().get('QA60',65535)
            if int(qa) & ((1<<10)|(1<<11)): raise ValueError('Cloud/cirrus at sample.')
            key = hashlib.sha256(json.dumps([meta['PRODUCT_ID'],site['crs'],list(affine)]).encode()).hexdigest()
            npy, js = cache/(key+'.npy'), cache/(key+'.json')
            if npy.exists() and js.exists(): return np.load(npy),json.loads(js.read_text())
            url = tci_url(meta['PRODUCT_ID'],meta['MGRS_TILE'])
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.jp2'):
                with rasterio.open(url) as src:
                    with WarpedVRT(src,crs=site['crs'],transform=affine,width=512,height=512,
                                   resampling=rasterio.enums.Resampling.nearest) as vrt:
                        rgb = vrt.read([1,2,3]).transpose(1,2,0)
                        valid = vrt.dataset_mask() > 0
            if rgb.dtype != np.uint8 or rgb.shape != (512,512,3) or not valid[256,256] or valid.mean() < 0.99:
                raise ValueError('Missing scene context or invalid TCI pixel.')
            meta.update(tci_url=url,crs=site['crs'],affine=list(affine),query_pixel=[256,256],
                        chip_sha256=hashlib.sha256(rgb.tobytes()).hexdigest(),
                        preprocessing='Original ESA L1C TCI RGB / 255; nearest warp to v0.2 10m grid',
                        temporal_note='One 2021 observation; annual class representativeness unqualified',
                        cloud_note='Scene cloud <=20%; QA60 central pixel clear; context may still contain clouds')
            np.save(npy,rgb);js.write_text(json.dumps(meta,indent=2))
            return rgb,meta
        except Exception as exc:
            failures.append(str(exc))
    raise ValueError('No usable exact TCI chip; point retained as unresolved. '+ '; '.join(failures))
