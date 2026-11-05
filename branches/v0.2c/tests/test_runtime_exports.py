import hashlib
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
TEMP=ROOT/'.cache/tests';TEMP.mkdir(parents=True,exist_ok=True)
from workflow import Workflow
from contracts import fingerprint

class RuntimeAndReview(unittest.TestCase):
    def test_gpu_gate_reports_actual_detected_device(self):
        from runtime import environment
        fake=types.SimpleNamespace(version=types.SimpleNamespace(cuda='test'),cuda=types.SimpleNamespace(is_available=lambda:True,device_count=lambda:1,get_device_name=lambda _: 'TEST_DEVICE'))
        self.assertEqual(environment(fake,require_gpu=True)['cuda_device_name'],'TEST_DEVICE')
    def test_missing_gpu_stops_instead_of_silent_cpu(self):
        from runtime import environment
        fake=types.SimpleNamespace(cuda=types.SimpleNamespace(is_available=lambda:False))
        with self.assertRaisesRegex(RuntimeError,'No CUDA'):environment(fake,require_gpu=True)
    def test_cpu_cannot_be_published_as_gpu_receipt(self):
        from drive_reports import upload_gpu_receipt
        with self.assertRaisesRegex(ValueError,'actual CUDA'):upload_gpu_receipt(None,{'passed':True,'environment':{'cuda_available':False}})
    def test_review_changes_preserve_immutable_history(self):
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp:
            f=Workflow(tmp);f.begin({'site':'Skeleton Coast Park'})
            f.training=[{'type':'Feature','geometry':{'type':'Point','coordinates':[12,-19]},'properties':{'sample_id':'test','class':None,'review_decision':'pending','reviewed':0}}];f.holdout=[]
            identity=f.run['run_id']
            a=f.review_training('test','correct',1,'TEST_ONLY','Unit-test evidence; not a real review',1.0,identity)
            b=f.review_training('test','reject',None,'TEST_ONLY','Unit-test rejection; not a real review',2.0,identity)
            events=list((f.run_dir/'review-events').glob('*.json'));self.assertEqual(len(events),2)
            self.assertIsNone(a['before']['class']);self.assertEqual(a['after']['class'],1)
            self.assertEqual(b['after']['review_decision'],'reject');self.assertIsNone(f.result)
    def test_stale_review_cannot_edit_new_run(self):
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp:
            f=Workflow(tmp);f.begin({})
            with self.assertRaisesRegex(ValueError,'earlier run'):f.review_training('x','accept',0,'TEST','test',1.0,'different')

class ExportTracking(unittest.TestCase):
    def test_request_id_is_not_used_as_server_id(self):
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp:
            f=Workflow(tmp);settings={'site':'Skeleton Coast Park'};f.begin(settings);f.revision=fingerprint(settings)
            f.result={'exports':[{'kind':'image' if i==0 else 'table','params':{'description':'test_'+str(i),'image' if i==0 else 'collection':'serialized'}} for i in range(6)]}
            made=[]
            class Task:
                id=None;name=None
                def start(self):
                    self.id='server-'+str(len(made));self.name='projects/test/operations/'+self.id;made.append(self)
            def statuses(ids):return [{'id':i,'state':'COMPLETED'} for i in ids]
            with patch('ee.deserializer.fromJSON',return_value=object()),patch('ee.batch.Export.image.toDrive',side_effect=lambda **_:Task()),patch('ee.batch.Export.table.toDrive',side_effect=lambda **_:Task()),patch('ee.data.newTaskId',return_value=['request-only']),patch('ee.data.getTaskStatus',side_effect=statuses):
                f.export(settings)
            self.assertTrue(all(x['id'].startswith('server-') and x['request_id']=='request-only' for x in f.run['export_tasks']))
    def test_unknown_request_id_recovers_without_resubmission(self):
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp:
            f=Workflow(tmp);f.begin({});f.run['export_tasks']=[{'id':'request-only','description':'exact-run-description'}]
            def statuses(ids):return [{'id':ids[0],'state':'UNKNOWN' if ids[0]=='request-only' else 'READY'}]
            ops=[{'name':'projects/test/operations/server-real','metadata':{'description':'exact-run-description'}}]
            with patch('ee.data.getTaskStatus',side_effect=statuses),patch('ee.data.listOperations',return_value=ops):r=f.task_status()
            self.assertEqual(r[0]['id'],'server-real');self.assertEqual(f.run['export_tasks'][0]['previous_client_request_id'],'request-only')
    def test_unfinished_exports_block_readback(self):
        from export_readback import download_completed
        with self.assertRaisesRegex(ValueError,'must complete'):download_completed(None,{},[{'state':'READY'}]*6,ROOT)
    def test_all_six_download_names_include_per_class(self):
        from export_readback import download_completed
        kinds=['map','predictions','metrics','per_class','confusion','provenance'];content=b'fixture'
        descriptors=[];items={}
        for index,kind in enumerate(kinds):
            name='test_run' if kind=='map' else 'test_run_'+kind
            params={'description':name+'_map' if kind=='map' else name}
            if kind=='map':params['fileNamePrefix']=name
            descriptors.append({'kind':'image' if kind=='map' else 'table','params':params})
            items[name]={'id':str(index),'name':name+('.tif' if kind=='map' else '.csv'),'size':str(len(content)),'md5Checksum':hashlib.md5(content).hexdigest()}
        class Response:
            status_code=200
            def __init__(self,body=None):self.body=body
            def raise_for_status(self):pass
            def json(self):return self.body
            def __enter__(self):return self
            def __exit__(self,*_):pass
            def iter_content(self,*_):yield content
        class Session:
            def get(self,url,params,**kwargs):
                if params.get('alt')=='media':return Response()
                key=params['q'].split("name contains '")[1].split("'")[0]
                return Response({'files':[items[key]]})
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp,patch('google.auth.transport.requests.AuthorizedSession',return_value=Session()):
            paths,downloaded=download_completed(None,{'exports':descriptors},[{'state':'COMPLETED'}]*6,tmp)
        self.assertEqual(set(paths),set(kinds));self.assertEqual(len(downloaded),6)

if __name__=='__main__':unittest.main(verbosity=2)
