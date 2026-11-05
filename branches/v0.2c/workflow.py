"""Single-notebook orchestration. Google credentials are never written into this package."""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import uuid

from contracts import accepted_training, fingerprint, proposal, validate_frames, validate_labels

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'config.json').read_text())

class Workflow:
    def __init__(self, output=None, progress=print):
        self.output = Path(output or ROOT/'runs')
        self.output.mkdir(parents=True,exist_ok=True)
        self.progress = progress
        self.credentials = None
        self.teacher = None
        self.result = None
        self.run = None
        self.tasks = []
        self.revision = None

    def connect(self, project):
        import ee
        import google.auth
        from google.auth.transport.requests import Request
        if project != CONFIG['project']:
            raise ValueError('This branch is configured for '+CONFIG['project'])
        try:
            from google.colab import auth
            auth.authenticate_user()
        except ImportError:
            pass
        try:
            credentials, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform',
                                                       'https://www.googleapis.com/auth/earthengine'])
        except google.auth.exceptions.DefaultCredentialsError:
            # Supported equivalent local EE tests can use the official EE OAuth store.
            # These credentials are not copied into code or supplied by the user in chat.
            credentials=ee.data.get_persistent_credentials()
        credentials.refresh(Request())
        ee.Initialize(credentials=credentials,project=project)
        # Force a real permission/API request before displaying Connected.
        if ee.Number(1).getInfo() != 1:
            raise RuntimeError('Earth Engine initialization probe failed.')
        self.credentials, self.project = credentials, project
        self.progress('Connected to Earth Engine project '+project+'.')

    def bridge(self, action, site, settings):
        if self.credentials is None:
            raise ValueError('Connect to Google first.')
        from google.auth.transport.requests import Request
        self.credentials.refresh(Request())
        run = self.run or {'run_id':'probe','started_utc':dt.datetime.now(dt.timezone.utc).isoformat()}
        payload = dict(action=action,site=site,settings=settings,project=self.project,
                       token=self.credentials.token,run_id=run['run_id'],started_utc=run['started_utc'])
        # stdin is private to this process. No credential appears in argv, logs or saved run data.
        p = subprocess.run(['node',str(ROOT/'bridge.cjs')],cwd=ROOT,input=json.dumps(payload),
                           capture_output=True,text=True,encoding='utf-8',timeout=1230)
        if p.returncode:
            raise RuntimeError('Earth Engine bridge failed: '+p.stderr[-2000:])
        value = json.loads(p.stdout)
        if value.get('error'):
            raise RuntimeError(value['error']+' '+str(value.get('detail',''))[:2000])
        return value

    def invalidate(self):
        self.result = None
        self.revision = None
        # Existing export jobs continue remotely and remain visible through task refresh.

    def begin(self, settings):
        self.invalidate()
        self.run = {'run_id':dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'_'+uuid.uuid4().hex[:8],
                    'started_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
                    'software_version':'0.2c','parent_version':'0.2.0','settings':copy.deepcopy(settings),
                    'status':'started','teacher_runs':0,'rf_fits':0,'EECU_hours':None}
        self.run_dir = self.output/self.run['run_id']
        self.run_dir.mkdir()
        self.save()

    def save(self):
        if self.run:
            (self.run_dir/'run.json').write_text(json.dumps(self.run,indent=2,allow_nan=False))

    def prepare(self, settings):
        self.begin(settings)
        if settings['backend']!='Vertex AI':
            from runtime import environment
            self.run['environment']=environment(require_gpu=True)
            self.save()
        site = settings['site']
        self.progress('Preparing fresh development frames; original blind references are not loaded.')
        data = self.bridge('prepare',site,settings)['frames']
        self.training = data['training']
        self.holdout = data['holdout']
        validate_frames(self.training,self.holdout,settings['separationMeters'])
        from teacher import SatlasTeacher, VertexTeacher
        from imagery import fetch_chip
        if settings['backend'] == 'Vertex AI':
            self.teacher = VertexTeacher(settings['endpoint'],self.credentials)
        elif self.teacher is None or type(self.teacher).__name__ != 'SatlasTeacher':
            self.progress('Loading the complete pretrained Satlas head; first use downloads weights.')
            self.teacher = SatlasTeacher(require_gpu=True)
        if hasattr(self.teacher,'runtime'):
            self.run['teacher_environment']=self.teacher.runtime
        mapping = CONFIG['sites'][site]['satlas_mapping']
        try:
            for group_name in ['training','holdout']:
                group = getattr(self,group_name)
                for index, feature in enumerate(group):
                    self.progress(f'Satlas {group_name}: {index+1}/{len(group)}')
                    rgb, imagery = fetch_chip(feature,CONFIG['sites'][site],ROOT/'.cache/chips')
                    prediction = self.teacher.predict(rgb)
                    teacher_provenance = dict(identity=prediction['identity'],imagery=imagery)
                    group[index] = proposal(feature,prediction['probabilities'],mapping,teacher_provenance,
                                            settings['confidence'])
                    group[index]['properties']['chip_file'] = str(ROOT/'.cache/chips'/(
                        __import__('hashlib').sha256(json.dumps([imagery['PRODUCT_ID'],CONFIG['sites'][site]['crs'],imagery['affine']]).encode()).hexdigest()+'.npy'))
                    self.run['teacher_runs'] += 1
                    self.run['teacher_identity'] = prediction['identity']
                    self.save_labels()
            import random, math
            confident=[f for f in self.training if not f['properties']['needs_review']]
            for f in random.Random(410).sample(confident,min(len(confident),max(1,math.ceil(0.1*len(confident))))):
                f['properties'].update(needs_review=True,review_reason='deterministic_10_percent_confident_audit')
            self.run['status'] = 'teacher_labels_ready_for_review'
            self.prepared_revision = fingerprint(settings)
            self.progress('Labels prepared. Inspect training points; flagged points require review. Holdout labels stay fixed.')
        except Exception:
            self.run['status'] = 'teacher_preparation_incomplete'
            raise
        finally:
            self.save_labels()

    def save_labels(self):
        for name in ['training','holdout']:
            (self.run_dir/(name+'.geojson')).write_text(json.dumps({'type':'FeatureCollection','features':getattr(self,name)},indent=2))
        self.save()

    def fit(self, settings, mode):
        if mode == 'Satlas-assisted diagnostic':
            if not hasattr(self,'prepared_revision') or self.prepared_revision != fingerprint(settings):
                raise ValueError('Settings changed: prepare a new teacher run.')
            training = accepted_training(self.training)
            validate_frames(training,self.holdout,settings['separationMeters'])
            validate_labels(training,self.holdout)
            cfg = dict(settings,training={'type':'FeatureCollection','features':training},
                       validation={'type':'FeatureCollection','features':self.holdout},
                       teacherProvenance=self.run['teacher_identity'])
            action = 'teacher'
            self.save_labels()
        else:
            self.begin(settings)
            cfg = dict(settings)
            action = 'approved' if mode == 'Approved-reference evaluation' else 'baseline'
            if action == 'approved':
                if not settings.get('independentReferencesConfirmed') or not settings.get('trainingAsset') or not settings.get('validationAsset'):
                    raise ValueError('Separate accepted training/locked validation asset IDs and coordinator attestation required.')
                if settings['trainingAsset'] == settings['validationAsset']:
                    raise ValueError('Training and validation must be different assets.')
        self.result = None
        try:
            result = self.bridge(action,settings['site'],cfg)
            self.run['rf_fits'] += 1
            self.run['status'] = 'metric_graph_and_raster_probe_completed'
            self.run['report'] = result['report']
            self.result = result
            self.revision = fingerprint(settings)
            (self.run_dir/'completed-result.json').write_text(json.dumps(result,indent=2))
            return result
        except Exception as exc:
            self.run['status'] = 'fit_or_evaluation_failed'
            self.run['last_error']=str(exc)
            raise
        finally:
            self.save()

    def export(self, settings):
        import ee
        if not self.result or self.revision != fingerprint(settings):
            raise ValueError('Only the current completed run can be exported.')
        if self.run.get('exports_submitted'):
            raise ValueError('Exports already submitted for this run; refresh existing task status.')
        self.run['exports_submitted'] = True # Avoid duplicate retries after partial network success.
        self.save()
        try:
            for descriptor in self.result['exports']:
                params = dict(descriptor['params'])
                key = 'image' if descriptor['kind']=='image' else 'collection'
                params[key] = ee.deserializer.fromJSON(params[key])
                if 'region' in params: params['region'] = ee.deserializer.fromJSON(params['region'])
                factory = ee.batch.Export.image.toDrive if descriptor['kind']=='image' else ee.batch.Export.table.toDrive
                task = factory(**params)
                # Persist task ID before starting; recover/check rather than duplicate a partially submitted job.
                task.id = ee.data.newTaskId()[0]
                task._request_id = task.id
                self.tasks.append(task)
                self.run.setdefault('export_tasks',[]).append({'id':task.id,'description':params['description']})
                self.save()
                task.start()
            return self.task_status()
        except Exception:
            self.run['export_submission_status'] = 'partial_or_failed_check_task_ids_before_retry'
            raise
        finally:
            self.save()

    def task_status(self):
        import ee
        ids = [x['id'] for x in (self.run or {}).get('export_tasks',[]) if x['id']]
        states = ee.data.getTaskStatus(ids) if ids else []
        if self.run:
            self.run['export_status'] = states
            self.save()
        return states

    def readback(self,settings):
        if not self.result or self.revision!=fingerprint(settings):
            raise ValueError('Readback requires the current completed run.')
        from export_readback import download_completed,check_bundle
        paths,files=download_completed(self.credentials,self.result,self.task_status(),self.run_dir/'exports')
        checked=check_bundle(paths,CONFIG['sites'][settings['site']],self.run['run_id'])
        checked['drive_files']=files
        (self.run_dir/'export-readback.json').write_text(json.dumps(checked,indent=2))
        self.run['export_readback_passed']=True
        self.save()
        return checked

    def coverage(self, settings):
        import ee
        if not self.result or self.revision != fingerprint(settings):
            raise ValueError('Generate the current run first.')
        region = ee.deserializer.fromJSON(self.result['region'])
        image = ee.ImageCollection('GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL').filterBounds(region).filterDate('2021-01-01','2022-01-01').mosaic()
        estimate = image.select(['A'+str(i).zfill(2) for i in range(64)]).mask().reduce(ee.Reducer.min()).unmask(0).reduceRegion(
            reducer=ee.Reducer.mean(),geometry=region,scale=500,crs=CONFIG['sites'][settings['site']]['crs'],maxPixels=1e9).getInfo()
        self.run['preliminary_500m_coverage'] = estimate
        self.save()
        return estimate

    def show_map(self, settings):
        import ee
        import folium
        if not self.result or self.revision != fingerprint(settings):
            raise ValueError('Generate the current run first.')
        image = ee.deserializer.fromJSON(self.result['classification'])
        region = ee.deserializer.fromJSON(self.result['region'])
        lon,lat = region.centroid(10).coordinates().getInfo()
        m = folium.Map(location=[lat,lon],zoom_start=6)
        tile = image.getMapId({'min':0,'max':2,'palette':CONFIG['sites'][settings['site']]['palette']})
        folium.TileLayer(tiles=tile['tile_fetcher'].url_format,attr='Google Earth Engine / SES410',name='v0.2c classification',overlay=True).add_to(m)
        folium.GeoJson(region.getInfo(),name='Study boundary',style_function=lambda _: {'color':'yellow','fillOpacity':0}).add_to(m)
        folium.LayerControl().add_to(m)
        return m
