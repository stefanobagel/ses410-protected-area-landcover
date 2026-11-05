"""Persist small credential-free runtime receipts in the existing output folder."""
import datetime as dt
import json
import uuid

def upload_gpu_receipt(credentials,report):
    from google.auth.transport.requests import AuthorizedSession
    if not (report.get('passed') and report.get('environment',{}).get('cuda_available') and
            str(report['environment'].get('model_device','')).startswith('cuda') and
            all(str(x.get('prediction',{}).get('device','')).startswith('cuda') for x in report.get('sites',[])) and len(report.get('sites',[]))==2):
        raise ValueError('A successful actual CUDA teacher receipt for both sites is required; CPU results cannot be uploaded as GPU evidence.')
    session=AuthorizedSession(credentials)
    query="trashed=false and 'me' in owners and mimeType='application/vnd.google-apps.folder' and name='SES410_v02c'"
    r=session.get('https://www.googleapis.com/drive/v3/files',params={'q':query,'fields':'files(id,name)','pageSize':100},timeout=60)
    r.raise_for_status();folders=r.json().get('files',[])
    if len(folders)!=1:raise RuntimeError('Expected one owned SES410_v02c output folder; resolve ambiguity before saving the GPU receipt.')
    name='SES410_v02c_GPU_SERVICE_SMOKE_'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'_'+uuid.uuid4().hex[:8]+'.json'
    metadata={'name':name,'parents':[folders[0]['id']],'mimeType':'application/json'}
    boundary='ses410_'+uuid.uuid4().hex
    data=('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+json.dumps(metadata)+
          '\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+json.dumps(report)+'\r\n--'+boundary+'--').encode()
    r=session.post('https://www.googleapis.com/upload/drive/v3/files',params={'uploadType':'multipart','fields':'id,name,size,md5Checksum'},
                   data=data,headers={'Content-Type':'multipart/related; boundary='+boundary},timeout=90)
    r.raise_for_status()
    return r.json()
