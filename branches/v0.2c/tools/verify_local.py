"""Local verification receipt. Does not authenticate to or execute Google services."""
import ast
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from tools.build_package import build

def verify():
    files=build()
    results=[]
    def check(name,fn):
        try:results.append({'name':name,'passed':True,'detail':fn()})
        except Exception as exc:results.append({'name':name,'passed':False,'detail':str(exc)})
    def command(argv):
        p=subprocess.run(argv,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=90)
        output=re.sub(r'\x1b\[[0-9;]*[A-Za-z]','',p.stdout+p.stderr)
        if p.returncode:raise RuntimeError(output)
        return output
    check('Python contracts and UI instantiation',lambda:command([sys.executable,'-B','-m','unittest','discover','-s','tests','-v']))
    check('6 actual v0.2c preflight callback contracts with EE doubles',lambda:command(['node','tests/test_extension.cjs']))
    def syntax():
        for name in files:
            p=ROOT/name
            if p.suffix=='.py':compile(p.read_text(),str(p),'exec')
            if p.suffix in ['.js','.cjs']:command(['node','--check',str(p)])
        return 'All packaged Python/JavaScript parses.'
    check('Source syntax',syntax)
    def notebook():
        n=json.loads((ROOT/'SES410_v0_2c.ipynb').read_text())
        for cell in n['cells']:
            if cell['cell_type']=='code':compile(''.join(cell['source']),'notebook','exec')
        tree=ast.parse(''.join(n['cells'][1]['source']))
        payload=next(node.value.args[0].value for node in tree.body if isinstance(node,ast.Assign) and node.targets[0].id=='payload')
        raw=base64.b64decode(payload)
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            for name in archive.namelist():
                if archive.read(name)!=(ROOT/name).read_bytes():raise ValueError('Embedded source mismatch: '+name)
        return {'cells':len(n['cells']),'embedded_files':len(archive.namelist()),'embedded_zip_sha256':hashlib.sha256(raw).hexdigest()}
    check('Self-contained notebook source identity',notebook)
    def serialization():
        import ee
        from ee.apitestcase import GetAlgorithms
        from unittest.mock import patch
        encoded=command(['node','-e',"const e=require('@google/earthengine'); e.data.getAlgorithms=()=>({}); console.log(e.Serializer.toJSON(e.Geometry.Point([15,-20])));"])
        with patch('ee.data.getAlgorithms',side_effect=GetAlgorithms):
            geometry=ee.deserializer.fromJSON(encoded)
            serialized=geometry.serialize()
        return {'JS_to_Python_geometry':serialized,'scope':'Literal geometry with bundled static API signatures; full live graph not executed.'}
    check('Earth Engine cross-language serialization',serialization)
    def graphs():
        import ee
        from ee.apitestcase import GetAlgorithms
        from unittest.mock import patch
        target=ROOT/'.cache';target.mkdir(exist_ok=True)
        signatures=target/'static-api-signatures.json';signatures.write_text(json.dumps(GetAlgorithms()))
        output=target/'offline-export-graphs.json'
        detail=command(['node','tests/test_graph.cjs',str(signatures),str(output)])
        with patch('ee.data.getAlgorithms',side_effect=GetAlgorithms):
            ee.ApiFunction.initialize()
            for item in json.loads(output.read_text()):
                key='image' if item['kind']=='image' else 'collection'
                ee.deserializer.fromJSON(item['params'][key]).serialize()
        return detail+'All six graph payloads deserialize in the Python client; fixture data only.'
    check('Real-client complete graph and six-export interchange',graphs)
    def cloud_sdk():
        from google.cloud import aiplatform,storage
        from google.cloud.devtools import cloudbuild_v1 as b
        import inspect
        build=b.Build(source={'storage_source':{'bucket':'test','object_':'test.tar.gz'}},
                      steps=[{'name':'gcr.io/cloud-builders/docker','args':['build','.']}],timeout={'seconds':2400})
        required=['serving_container_image_uri','serving_container_predict_route','serving_container_health_route','serving_container_ports']
        params=inspect.signature(aiplatform.Model.upload).parameters
        if not all(p in params for p in required):raise ValueError('Unsupported Vertex SDK upload signature.')
        return {'cloud_build_source':str(build.source),'vertex_upload_signature':'required parameters present','external_calls':0}
    check('Vertex/Cloud Build SDK construction',cloud_sdk)
    receipt={'software_version':'0.2c','scope':'Only this local verification command; dated live-service receipts report separate real execution',
             'results':results,'all_passed':all(x['passed'] for x in results),
             'live_GEE_fits':0,'live_teacher_inferences':0,'Vertex_endpoints_deployed':0,'EECU_hours':None,
             'limits':['This command does not authenticate to Google or infer with PyTorch','Windows native PyTorch execution is excluded; hosted Linux is used for real inference',
                       'API mocks and parser checks do not qualify cloud execution, model accuracy or scientific independence']}
    path=ROOT/'.cache/local-verification.json';path.parent.mkdir(exist_ok=True);path.write_text(json.dumps(receipt,indent=2))
    print(json.dumps(receipt,indent=2))
    return receipt

if __name__=='__main__':sys.exit(0 if verify()['all_passed'] else 1)
