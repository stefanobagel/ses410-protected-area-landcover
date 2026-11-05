"""Bounded real-service Satlas smoke test, two public in-area image queries.

Uses public TCI storage and public pinned model weights. No Google credentials,
reference labels, RF fitting or scientific accuracy claims. CPU is explicit.
"""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
POINTS=[
 {'site':'Skeleton Coast Park','lon':12.847982722238168,'lat':-19.18938740695067,'mgrs':'33KTU','crs':'EPSG:32733'},
 {'site':'Salonga National Park','lon':21.495035844446864,'lat':-2.0334168747529744,'mgrs':'34MEC','crs':'EPSG:32734'}]

def find_tci(mgrs):
    import requests
    from imagery import tci_url
    prefix=f'tiles/{mgrs[:2]}/{mgrs[2]}/{mgrs[3:]}/S2A_MSIL1C_202101'
    r=requests.get('https://storage.googleapis.com/storage/v1/b/gcp-public-data-sentinel-2/o',
                   params={'prefix':prefix,'delimiter':'/','maxResults':50,'fields':'prefixes'},timeout=60)
    r.raise_for_status()
    products=[s.rstrip('/').split('/')[-1].removesuffix('.SAFE') for s in r.json().get('prefixes',[])]
    if not products:raise RuntimeError('No public January2021 L1C products for '+mgrs)
    failures=[]
    for product in products[:3]:
        try:return product,tci_url(product,mgrs)
        except Exception as exc:failures.append(str(exc))
    raise RuntimeError('Exact TCI lookup failed: '+'; '.join(failures))

def main():
    import torch
    import numpy as np
    from teacher import SatlasTeacher
    from imagery import read_tci_chip
    from contracts import CLASSES
    start=time.perf_counter();torch.set_num_threads(2)
    receipt={'started_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'git_commit':os.environ.get('GITHUB_SHA'),
             'scope':'Real public-image teacher inference only; not a Colab GPU or authenticated Earth Engine test',
             'point_selection':'Centers of valid historical v0.2 output masks; class values not used. No frozen/reviewed reference point loaded.',
             'cloud_screening':'January2021 scene picked from public storage; cloud quality NOT qualified without EE QA60',
             'Google_authentication':False,'RF_fits':0,'exports':0,'Vertex_deployments':0,'EECU_hours':None,
             'runner_billing':'Standard ubuntu-24.04 CPU runner in a public repository; no cache/artifact upload',
             'sites':[]}
    try:
        teacher=SatlasTeacher(device='cpu')
        receipt.update(environment=teacher.runtime,teacher_identity=teacher.identity,
                       checkpoint_load_elapsed_s=time.perf_counter()-start)
        for point in POINTS:
            product,url=find_tci(point['mgrs'])
            rgb,georef=read_tci_chip(url,point['lon'],point['lat'],point['crs'])
            prediction=teacher.predict(rgb)
            probs=prediction['probabilities'];winner=int(np.argmax(probs))
            receipt['sites'].append(dict(point,product_id=product,image_date=product.split('_')[2],tci_url=url,
                  georeferencing=georef,input_dtype=str(rgb.dtype),prediction=prediction,
                  teacher_class=CLASSES[winner],teacher_probability=probs[winner]))
        receipt['passed']=True
    except Exception as exc:
        receipt.update(passed=False,error=type(exc).__name__+': '+str(exc));raise
    finally:
        receipt['elapsed_s']=time.perf_counter()-start
        target=ROOT/'.cache/linux-service-smoke.json';target.parent.mkdir(exist_ok=True);target.write_text(json.dumps(receipt,indent=2))
        print('SES410_SERVICE_RECEIPT_BEGIN',flush=True)
        print(json.dumps(receipt,sort_keys=True),flush=True)
        print('SES410_SERVICE_RECEIPT_END',flush=True)
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f:
                f.write('## v0.2c real public-service smoke\n\n```json\n'+json.dumps(receipt,indent=2)+'\n```\n')

if __name__=='__main__':main()
