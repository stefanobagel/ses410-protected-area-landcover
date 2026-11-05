"""Load the complete trained Satlas land-cover head; never random-head inference."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'config.json').read_text())
COMMIT = CONFIG['teacher_commit']

def download(url, path):
    import requests
    path = Path(path)
    temporary = path.with_suffix(path.suffix+'.part')
    with requests.get(url, stream=True, timeout=(30,120)) as r:
        r.raise_for_status()
        with temporary.open('wb') as f:
            for chunk in r.iter_content(1024*1024):
                f.write(chunk)
    os.replace(temporary,path)

class SatlasTeacher:
    def __init__(self, cache=None, device=None, require_gpu=False):
        import requests
        import torch
        from runtime import environment
        self.runtime=environment(torch,require_gpu=require_gpu)
        self.cache = Path(cache or os.environ.get('SES410_MODEL_CACHE', ROOT/'.cache'))
        self.cache.mkdir(parents=True, exist_ok=True)
        source = self.cache/('satlas-'+COMMIT)
        if not source.exists():
            archive = self.cache/'satlas-source.zip'
            download('https://codeload.github.com/allenai/satlas/zip/'+COMMIT, archive)
            with zipfile.ZipFile(archive) as z:
                for name in z.namelist():
                    if not (self.cache/name).resolve().is_relative_to(self.cache.resolve()):
                        raise ValueError('Unsafe source archive path.')
                z.extractall(self.cache)
        identity_path = self.cache/'checkpoint-identity.json'
        if identity_path.exists():
            identity = json.loads(identity_path.read_text())
        else:
            identity = {'repository':'allenai/satlas-pretrain','revision':CONFIG['teacher_checkpoint_revision'],
                        'checkpoint':CONFIG['teacher_checkpoint']}
        if identity['revision'] != CONFIG['teacher_checkpoint_revision'] or identity['checkpoint'] != CONFIG['teacher_checkpoint']:
            raise ValueError('Cached checkpoint differs from the pinned v0.2c teacher.')
        weights = self.cache/identity['checkpoint']
        if not weights.exists():
            download('https://huggingface.co/allenai/satlas-pretrain/resolve/'+identity['revision']+'/'+identity['checkpoint'],weights)
        with weights.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if identity.get('sha256') and identity['sha256'] != digest:
            raise ValueError('Cached trained checkpoint hash changed.')
        identity.update(sha256=digest, source_commit=COMMIT, license='ODC-BY')
        identity_path.write_text(json.dumps(identity,indent=2))
        self.identity = identity
        sys.path.insert(0,str(source))
        import satlas.model.dataset as dataset
        import satlas.model.model as model_module
        config = json.loads((source/'configs/sentinel2/swinb_si_rgb.txt').read_text())
        for task in config['Tasks']:
            task['Task'] = dataset.tasks[task['Name']]
        self.head = [i for i,t in enumerate(config['Tasks']) if t['Name']=='land_cover'][0]
        expected = ['background','water','developed','tree','shrub','grass','crop','bare','snow','wetland','mangroves','moss']
        if config['Tasks'][self.head]['Task']['categories'] != expected:
            raise ValueError('Upstream land-cover taxonomy changed.')
        config['Model']['Backbone']['Pretrained'] = False # All weights immediately restored strictly below.
        with contextlib.redirect_stdout(io.StringIO()):
            self.model = model_module.Model({'config':config['Model'],'channels':config['Channels'],'tasks':config['Tasks']})
        state = torch.load(weights, map_location='cpu', weights_only=True)
        self.model.load_state_dict(state, strict=True)
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.model.to(self.device).eval()
        self.runtime['model_device']=str(next(self.model.parameters()).device)
        if require_gpu and not self.runtime['model_device'].startswith('cuda'):
            raise RuntimeError('Teacher weights are not on the requested CUDA device.')

    def predict(self, rgb, row=256, col=256):
        import numpy as np
        import torch
        import time
        if rgb.shape != (512,512,3) or rgb.dtype != np.uint8:
            raise ValueError('Satlas expects a 512 x 512 uint8 ESA L1C TCI RGB chip.')
        if not (0 <= row < 512 and 0 <= col < 512):
            raise ValueError('Query pixel outside chip.')
        tensor = torch.from_numpy(rgb.transpose(2,0,1).copy()).float().to(self.device)/255.0
        started=time.perf_counter()
        with torch.inference_mode():
            outputs, _ = self.model([tensor], selected_task='land_cover')
            raster=outputs[self.head][0]
            if tuple(raster.shape)!=(12,512,512):
                raise ValueError('Unexpected trained land-cover output shape: '+str(tuple(raster.shape)))
            values = raster[:,row,col].detach().cpu().tolist()
        if not np.isfinite(values).all() or min(values)<0 or abs(sum(values)-1)>0.001:
            raise ValueError('Invalid teacher probabilities at query pixel.')
        return {'probabilities':values,'identity':self.identity,'output_shape':list(raster.shape),
                'input_shape':list(tensor.shape),'device':str(tensor.device),'elapsed_s':time.perf_counter()-started}

class VertexTeacher:
    def __init__(self, endpoint, credentials):
        import re
        match = re.fullmatch(r'projects/([a-z0-9-]+)/locations/([a-z0-9-]+)/endpoints/([0-9]+)',endpoint)
        if not match or match[1] != CONFIG['project']:
            raise ValueError('Provide a numeric Vertex endpoint resource in the authorized project.')
        self.endpoint, self.credentials, self.region = endpoint, credentials, match[2]
        self.identity = None

    def predict(self, rgb, row=256, col=256):
        import base64
        from PIL import Image
        from google.auth.transport.requests import AuthorizedSession
        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf,format='PNG')
        payload = {'instances':[{'rgb_png':base64.b64encode(buf.getvalue()).decode(),'row':row,'col':col}]}
        response = AuthorizedSession(self.credentials).post(
            'https://'+self.region+'-aiplatform.googleapis.com/v1/'+self.endpoint+':predict',json=payload,timeout=300)
        response.raise_for_status()
        result = response.json()['predictions'][0]
        if result['identity']['source_commit'] != COMMIT:
            raise ValueError('Unexpected Vertex teacher source identity.')
        if (result['identity'].get('revision')!=CONFIG['teacher_checkpoint_revision'] or
                result['identity'].get('checkpoint')!=CONFIG['teacher_checkpoint']):
            raise ValueError('Vertex endpoint checkpoint differs from the pinned Colab teacher.')
        if self.identity and self.identity != result['identity']:
            raise ValueError('Teacher identity changed within this run.')
        self.identity = result['identity']
        return result
