"""Read completed output files, recompute metrics, and verify raster/point agreement.
Files are evidence. No reference labels are created or edited by this module.
"""
import csv
import hashlib
import json
import math
from pathlib import Path

def rows(path):
    with Path(path).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))

def number(value):
    if value in [None,'','null']:return None
    x=float(value)
    if not math.isfinite(x):raise ValueError('Nonfinite exported metric.')
    return x

def require(condition,message):
    if not condition:raise ValueError(message)

def check_bundle(paths,site,run_id,version='0.2c'):
    import numpy as np
    import rasterio
    from rasterio.warp import transform
    expected={'map','predictions','metrics','per_class','confusion','provenance'}
    require(set(paths)==expected,'All six export types are required.')
    maps=paths['map'] if isinstance(paths['map'],list) else [paths['map']]
    summary=rows(paths['metrics']);provenance=rows(paths['provenance'])
    require(len(summary)==1 and len(provenance)==1,'One summary/provenance row is required.')
    s,p=summary[0],provenance[0]
    require(s['run_id']==run_id and p['run_id']==run_id,'Export run identities differ.')
    require(s['software_version']==version and p['software_version']==version,'Unexpected software version.')
    require(p['crs']==site['crs'] and number(p['scale_m'])==10,'Unexpected exported grid provenance.')
    require(number(p['year'])==2021 and number(p['trees'])==200,'Unexpected year/tree configuration.')
    require(p['class_order']=='0,1,2' and p['status']==s['status'],'Legend order/status mismatch.')
    if s['status']=='SATLAS_TEACHER_AGREEMENT_NOT_VALIDATED':
        require(p['candidate_source']=='SATLAS_PRETRAIN_TRAINED_LAND_COVER_HEAD','Teacher source not recorded.')
        identity=json.loads(p['teacher_provenance'])
        require(bool(identity.get('sha256')),'Teacher checkpoint hash absent.')
    predictions=rows(paths['predictions']);cells=rows(paths['confusion']);classes=rows(paths['per_class'])
    require(len(cells)==9 and len(classes)==3,'Complete 3x3 confusion and class rows required.')
    matrix=np.zeros((3,3),dtype=int)
    seen=set()
    for row in cells:
        i,j=int(row['reference_class']),int(row['predicted_class']);count=number(row['count'])
        require(0<=i<3 and 0<=j<3 and count is not None and count>=0 and count==int(count),'Invalid confusion cell.')
        require((i,j) not in seen,'Duplicate confusion cell.');seen.add((i,j));matrix[i,j]=int(count)
    reconstructed=np.zeros((3,3),dtype=int);points=[];ids=set()
    for row in predictions:
        require(row['sample_id'] not in ids,'Duplicate prediction sample ID.');ids.add(row['sample_id'])
        a,b=int(row['class']),int(row['prediction'])
        require(a in range(3) and b in range(3),'Invalid exported class code.')
        g=json.loads(row['.geo']);xy=g.get('coordinates',[])
        require(g.get('type')=='Point' and len(xy)==2 and -180<=xy[0]<=180 and -90<=xy[1]<=90,'Invalid prediction coordinates.')
        reconstructed[a,b]+=1;points.append((xy[0],xy[1],b))
    require(np.array_equal(matrix,reconstructed),'Confusion table differs from point predictions.')
    n=len(predictions)
    require(n>0 and n==number(s['validation_n'])==number(p['validation_pixels']),'Exported sample counts disagree.')
    agreement=float(np.trace(matrix)/n)
    require(abs(agreement-number(s['overall_accuracy']))<1e-10,'Summary agreement differs from predictions.')
    f1=[]
    for row in classes:
        c=int(row['class_code']);actual=int(matrix[c].sum());predicted=int(matrix[:,c].sum());tp=int(matrix[c,c])
        require(actual==number(row['reference_n']) and predicted==number(row['prediction_n']),'Per-class support differs.')
        for key,want in [('recall_producer',tp/actual if actual else None),('precision_user',tp/predicted if predicted else None),
                         ('f1',2*tp/(actual+predicted) if actual+predicted else None)]:
            got=number(row[key]);require((got is None and want is None) or (got is not None and want is not None and abs(got-want)<1e-10),'Per-class '+key+' differs or undefined value was filled.')
        f1.append(number(row['f1']))
    macro=sum(f1)/3 if all(matrix[c].sum()>0 for c in range(3)) else None
    got=number(s['macro_f1_full_legend'])
    require((got is None and macro is None) or (got is not None and macro is not None and abs(got-macro)<1e-10),'Macro F1 support/undefined behavior differs.')
    unmatched=set(range(n));raster_reports=[]
    for filename in maps:
        with rasterio.open(filename) as raster:
            require(str(raster.crs)==site['crs'],'GeoTIFF CRS differs.')
            require(raster.count==1 and raster.dtypes==('uint8',) and raster.nodata==255,'GeoTIFF bands/type/NoData differ.')
            require(abs(raster.transform.a-10)<1e-8 and abs(raster.transform.e+10)<1e-8 and raster.transform.b==raster.transform.d==0,'GeoTIFF is not the documented 10m grid.')
            codes=set()
            for _,window in raster.block_windows(1):codes.update(np.unique(raster.read(1,window=window)).tolist())
            require(codes.issubset({0,1,2,255}),'Unexpected GeoTIFF class codes.')
            for index in list(unmatched):
                lon,lat,prediction=points[index];x,y=transform('EPSG:4326',raster.crs,[lon],[lat]);r,c=raster.index(x[0],y[0])
                if 0<=r<raster.height and 0<=c<raster.width:
                    value=int(next(raster.sample([(x[0],y[0])]))[0])
                    require(value==prediction,'GeoTIFF differs from prediction at sample '+str(index))
                    unmatched.remove(index)
            raster_reports.append({'file':Path(filename).name,'crs':str(raster.crs),'resolution':list(raster.res),
                'nodata':raster.nodata,'class_codes':sorted(codes),'width':raster.width,'height':raster.height,'bounds':list(raster.bounds)})
    require(not unmatched,'Some prediction points are outside the exported GeoTIFFs.')
    all_files=maps+[paths[k] for k in expected-{'map'}]
    return {'passed':True,'run_id':run_id,'software_version':version,'status':s['status'],'sample_n':n,
            'recomputed_agreement':agreement,'matrix':matrix.tolist(),'rasters':raster_reports,
            'scope':'Export consistency and unweighted diagnostic/reference sample metrics; not independent accuracy certification',
            'files':[{'name':Path(f).name,'bytes':Path(f).stat().st_size,'sha256':hashlib.sha256(Path(f).read_bytes()).hexdigest()} for f in all_files]}

def download_completed(credentials,result,task_states,destination):
    from google.auth.transport.requests import AuthorizedSession
    require(len(task_states)==6 and all(x.get('state')=='COMPLETED' for x in task_states),'All six export tasks must complete before readback.')
    session=AuthorizedSession(credentials);destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
    paths={};downloaded=[]
    for descriptor in result['exports']:
        params=descriptor['params']
        kind='map' if descriptor['kind']=='image' else next((k for k in ['predictions','metrics','per_class','confusion','provenance'] if params['description'].endswith('_'+k)),None)
        require(kind is not None,'Unknown export type in completed run.')
        # The inherited summary task uses the suffix metrics.
        prefix=params.get('fileNamePrefix',params['description'])
        safe=prefix.replace('\\','\\\\').replace("'","\\'")
        query="trashed=false and 'me' in owners and name contains '"+safe+"'"
        page=None;matches=[]
        while True:
            args={'q':query,'fields':'files(id,name,size,md5Checksum),nextPageToken','pageSize':100}
            if page:args['pageToken']=page
            r=session.get('https://www.googleapis.com/drive/v3/files',params=args,timeout=60)
            if r.status_code in [401,403]:raise RuntimeError('Drive download authorization is missing; completed export jobs remain intact. Authorize Drive access in this runtime before readback.')
            r.raise_for_status();body=r.json();matches.extend(body.get('files',[]));page=body.get('nextPageToken')
            if not page:break
        extension='.tif' if kind=='map' else '.csv'
        matches=[x for x in matches if x['name'].endswith(extension) and (x['name']==prefix+extension or (kind=='map' and x['name'].startswith(prefix+'-')))]
        require(bool(matches) and (kind=='map' or len(matches)==1),'Missing or ambiguous completed output '+kind)
        paths[kind]=[] if kind=='map' else None
        for item in matches:
            target=destination/Path(item['name']).name
            with session.get('https://www.googleapis.com/drive/v3/files/'+item['id'],params={'alt':'media'},stream=True,timeout=180) as response:
                response.raise_for_status()
                with target.open('wb') as f:
                    for chunk in response.iter_content(1024*1024):f.write(chunk)
            require(target.stat().st_size==int(item['size']),'Drive size mismatch.')
            if item.get('md5Checksum'):require(hashlib.md5(target.read_bytes()).hexdigest()==item['md5Checksum'],'Drive MD5 mismatch.')
            downloaded.append({'id':item['id'],'name':item['name'],'bytes':target.stat().st_size})
            if kind=='map':paths[kind].append(target)
            else:paths[kind]=target
    return paths,downloaded
