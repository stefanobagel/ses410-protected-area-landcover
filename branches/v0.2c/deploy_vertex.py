"""Optional billable deployment from the SAME notebook. No billing or IAM changes.
Requires Vertex AI, Cloud Build, Artifact Registry and Storage APIs already enabled,
billing enabled, and sufficient existing user/build-service-account permissions.
Failures preserve actionable API errors. Nothing silently weakens permissions.
"""
import io
import json
from pathlib import Path
import tarfile
import time

ROOT = Path(__file__).resolve().parent
PROJECT = json.loads((ROOT/'config.json').read_text())['project']

def deploy(credentials, region='us-central1', progress=print):
    from google.cloud import aiplatform, storage
    from google.cloud.devtools import cloudbuild_v1 as build_v1
    from google.auth.transport.requests import AuthorizedSession
    from google.api_core.exceptions import NotFound
    session = AuthorizedSession(credentials)
    # Verify APIs; do not enable billing, alter IAM or implicitly switch projects.
    for api in ['aiplatform.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','storage.googleapis.com']:
        response=session.get(f'https://serviceusage.googleapis.com/v1/projects/{PROJECT}/services/{api}',timeout=30)
        response.raise_for_status()
        if response.json().get('state')!='ENABLED':raise ValueError('Enable '+api+' in the authorized project before deployment.')
    parent=f'projects/{PROJECT}/locations/{region}'
    repo=parent+'/repositories/ses410-v02c'
    response=session.get('https://artifactregistry.googleapis.com/v1/'+repo,timeout=30)
    if response.status_code==404:
        response=session.post('https://artifactregistry.googleapis.com/v1/'+parent+'/repositories',
                              params={'repositoryId':'ses410-v02c'},json={'format':'DOCKER','description':'SES410 v0.2c teacher only'},timeout=60)
        response.raise_for_status();operation=response.json()['name']
        for _ in range(120):
            state=session.get('https://artifactregistry.googleapis.com/v1/'+operation,timeout=30).json()
            if state.get('error'):raise RuntimeError(str(state['error']))
            if state.get('done'):break
            time.sleep(2)
        else:raise TimeoutError('Artifact Registry creation timed out.')
    else:response.raise_for_status()
    client=storage.Client(project=PROJECT,credentials=credentials)
    bucket_name=PROJECT+'-ses410-v02c-build'
    bucket=client.bucket(bucket_name)
    try:bucket.reload()
    except NotFound:bucket=client.create_bucket(bucket,location=region)
    content=io.BytesIO()
    with tarfile.open(fileobj=content,mode='w:gz') as tar:
        for name in ['Dockerfile','config.json','teacher.py','runtime.py','vertex_server.py']:
            tar.add(ROOT/name,arcname=name)
    stamp=str(int(time.time()))
    blob=bucket.blob('builds/'+stamp+'.tar.gz');blob.upload_from_string(content.getvalue(),content_type='application/gzip')
    image=f'{region}-docker.pkg.dev/{PROJECT}/ses410-v02c/satlas:{stamp}'
    build=build_v1.Build(source={'storage_source':{'bucket':bucket.name,'object_':blob.name}},
                        steps=[{'name':'gcr.io/cloud-builders/docker','args':['build','-t',image,'.']}],
                        images=[image],timeout={'seconds':2400})
    progress('Cloud Build started. Existing build-service-account permissions must allow Artifact Registry writes.')
    operation=build_v1.CloudBuildClient(credentials=credentials).create_build(project_id=PROJECT,build=build)
    while not operation.done():
        progress('Cloud Build is preparing the Satlas container…');time.sleep(20)
    built=operation.result()
    if built.status != build_v1.Build.Status.SUCCESS:raise RuntimeError('Cloud Build failed: '+str(built.status))
    aiplatform.init(project=PROJECT,location=region,credentials=credentials)
    model=aiplatform.Model.upload(display_name='ses410-v02c-satlas-'+stamp,
          serving_container_image_uri=image,serving_container_predict_route='/predict',
          serving_container_health_route='/health',serving_container_ports=[8080])
    # Record recoverable resource IDs BEFORE deployment, including failed attempts.
    receipt={'project':PROJECT,'region':region,'image':image,'model':model.resource_name,'status':'model_uploaded'}
    receipt_file=ROOT/'vertex-resources.json';receipt_file.write_text(json.dumps(receipt,indent=2))
    endpoint=aiplatform.Endpoint.create(display_name='ses410-v02c-satlas-'+stamp)
    receipt.update(endpoint=endpoint.resource_name,status='endpoint_created');receipt_file.write_text(json.dumps(receipt,indent=2))
    progress('Deploying one n1-standard-4 CPU replica; billing continues while deployed.')
    model.deploy(endpoint=endpoint,machine_type='n1-standard-4',min_replica_count=1,max_replica_count=1,
                 traffic_percentage=100,deployed_model_display_name='ses410-v02c-satlas')
    receipt.update(status='deployed');receipt_file.write_text(json.dumps(receipt,indent=2))
    return receipt

def undeploy(credentials, endpoint_name):
    from google.cloud import aiplatform
    from teacher import VertexTeacher
    VertexTeacher(endpoint_name,credentials) # Validate project/resource path before mutation.
    region=endpoint_name.split('/')[3]
    aiplatform.init(project=PROJECT,location=region,credentials=credentials)
    endpoint=aiplatform.Endpoint(endpoint_name=endpoint_name)
    # Scoped to this package's explicitly named deployment; never touch other models.
    if not endpoint.display_name.startswith('ses410-v02c-satlas-'):
        raise ValueError('Endpoint is not a v0.2c deployment.')
    endpoint.undeploy_all()
    return {'endpoint':endpoint_name,'status':'undeployed; stored image/model/build artifacts retained'}
