import base64
import contextlib
import copy
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
TEMP=ROOT/'.cache/tests'
TEMP.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT))
from contracts import proposal, validate_frames, validate_labels, fingerprint
from workflow import Workflow

def feature(key,xy,role='candidate_training',label=0):
    return {'type':'Feature','geometry':{'type':'Point','coordinates':xy},
            'properties':{'sample_id':key,'unit_id':key,'pixel_id':key,'role':role,'reference_year':2021,'class':label}}

class Contracts(unittest.TestCase):
    def setUp(self):
        self.training=[feature(str(i),[10+i*.01,0],label=i) for i in range(3)]
        self.holdout=[feature('h',[11,0],'pilot_holdout')]
    def test_frames_and_labels(self):validate_frames(self.training,self.holdout);validate_labels(self.training,self.holdout)
    def test_shared_identity(self):
        self.holdout[0]['properties']['sample_id']='0'
        with self.assertRaisesRegex(ValueError,'Shared'):validate_frames(self.training,self.holdout)
    def test_close_cross_set(self):
        self.holdout[0]['geometry']['coordinates']=[10.0001,0]
        with self.assertRaisesRegex(ValueError,'exclusion'):validate_frames(self.training,self.holdout)
    def test_frozen_role_rejected(self):
        self.holdout[0]['properties']['role']='validation'
        with self.assertRaises(ValueError):validate_frames(self.training,self.holdout)
    def test_duplicate_pixels(self):
        self.training[1]['properties']['pixel_id']='0'
        with self.assertRaisesRegex(ValueError,'Duplicate analysis'):validate_frames(self.training,self.holdout)
    def test_unsupported_class(self):
        self.training[2]['properties']['class']=1
        with self.assertRaisesRegex(ValueError,'training support'):validate_labels(self.training,self.holdout)
    def test_unmapped_holdout_not_dropped(self):
        self.holdout[0]['properties']['class']=None
        with self.assertRaisesRegex(ValueError,'unmapped holdout'):validate_labels(self.training,self.holdout)
    def test_teacher_never_approves(self):
        f=proposal(self.training[0],[0,1]+[0]*10,{'1':0},{'test':'identity'})
        self.assertEqual(f['properties']['reviewed'],0)
        self.assertEqual(f['properties']['review_decision'],'pending')
        self.assertNotIn('reviewed',self.training[0]['properties'])
    def test_probability_shape_and_nan(self):
        for values in [[1], [float('nan')]+[0]*11,[0]*12]:
            with self.assertRaises(ValueError):proposal(self.training[0],values,{}, {})
    def test_flagged_points_gate(self):
        self.training[0]['properties']['needs_review']=True
        with self.assertRaisesRegex(ValueError,'Review flagged'):validate_labels(self.training,self.holdout)
    def test_changed_settings_invalidate(self):
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp:
            flow=Workflow(tmp);flow.result={'complete':True};flow.revision='old';flow.invalidate()
            self.assertIsNone(flow.result);self.assertIsNone(flow.revision)
    def test_fit_cannot_reuse_old_teacher_settings(self):
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp:
            flow=Workflow(tmp);flow.prepared_revision='old'
            with self.assertRaisesRegex(ValueError,'Settings changed'):flow.fit({'site':'Salonga National Park'},'Satlas-assisted diagnostic')
    def test_export_stale_blocked(self):
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp:
            flow=Workflow(tmp)
            with self.assertRaisesRegex(ValueError,'current completed'):flow.export({})
    def test_fingerprint_order_independent(self):self.assertEqual(fingerprint({'a':1,'b':2}),fingerprint({'b':2,'a':1}))
    def test_vertex_rejects_wrong_project(self):
        from teacher import VertexTeacher
        with self.assertRaisesRegex(ValueError,'authorized project'):VertexTeacher('projects/wrong/locations/us-central1/endpoints/123',None)
    def test_geographic_nan_rejected(self):
        self.training[0]['geometry']['coordinates']=[float('nan'),0]
        with self.assertRaises(ValueError):validate_frames(self.training,self.holdout)
    def test_labels_wrong_year_rejected(self):
        self.training[0]['properties']['reference_year']=2024
        with self.assertRaises(ValueError):validate_frames(self.training,self.holdout)

class Server(unittest.TestCase):
    def test_endpoint_payload_and_health(self):
        import numpy as np
        import vertex_server
        from fastapi import HTTPException
        from pydantic import ValidationError
        from PIL import Image
        fake=types.SimpleNamespace(identity={'source_commit':'test'},predict=lambda rgb,r,c:{'probabilities':[0,1]+[0]*10,'identity':{'source_commit':'test'}})
        original=vertex_server.teacher;vertex_server.teacher=fake
        try:
            self.assertEqual(vertex_server.health()['status'],'ready')
            stream=io.BytesIO();Image.fromarray(np.zeros((512,512,3),dtype=np.uint8)).save(stream,format='PNG')
            reply=vertex_server.predict(vertex_server.Request(instances=[{'rgb_png':base64.b64encode(stream.getvalue()).decode()}]))
            self.assertEqual(reply['predictions'][0]['probabilities'][1],1)
            with self.assertRaises(HTTPException):vertex_server.predict(vertex_server.Request(instances=[{'rgb_png':'bad'}]))
            with self.assertRaises(ValidationError):vertex_server.Request(instances=[])
        finally:vertex_server.teacher=original
    def test_image_dimensions_rejected(self):
        import vertex_server
        from fastapi import HTTPException
        from PIL import Image
        stream=io.BytesIO();Image.new('RGB',(32,32)).save(stream,format='PNG')
        with patch.object(vertex_server,'teacher',object()):
            with self.assertRaises(HTTPException):vertex_server.predict(vertex_server.Request(instances=[{'rgb_png':base64.b64encode(stream.getvalue()).decode()}]))

class Interface(unittest.TestCase):
    def test_ui_launch_and_approval_invalidation(self):
        import ui
        displayed=[]
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp, patch('IPython.display.display',side_effect=displayed.append),patch('workflow.Workflow',side_effect=lambda **kw:Workflow(tmp,**kw)):
            flow=ui.launch()
            root=displayed[-1]
            project,connect,site,mode,analyst,actions,status,tabs,outputs=root.children[1:]
            self.assertEqual(project.value,'project-4516fd38-855a-44f4-a31')
            self.assertTrue(outputs.children[1].disabled)
            advanced=analyst.children[0].children
            training,validation,design,protocol,attest=advanced[-5:]
            training.value='train';validation.value='val';attest.value=True
            site.value='Salonga National Park'
            self.assertEqual(training.value,'');self.assertEqual(validation.value,'');self.assertFalse(attest.value)
            self.assertIsNone(flow.result)

if __name__=='__main__':unittest.main(verbosity=2)
