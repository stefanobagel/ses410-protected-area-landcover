"""Deterministic single-file notebook build. Explicit allowlist excludes runtime/private files."""
import base64
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[1]
SOURCES=['config.json','package.json','requirements.txt','contracts.py','teacher.py','imagery.py',
         'workflow.py','ui.py','bootstrap.py','extension.js','bridge.cjs','vertex_server.py','deploy_vertex.py',
         'Dockerfile','README.md','STATUS.md','.gitignore','tools/build_package.py','tools/verify_local.py',
         'tests/test_contracts.py','tests/test_extension.cjs','tests/test_graph.cjs',
         'baseline/SES410_landcover_v0_2.js','baseline/APP_LANDCOVER_v0_2.js']

def build():
    gee=ROOT/'gee';gee.mkdir(exist_ok=True)
    core=(ROOT/'baseline/SES410_landcover_v0_2.js').read_text()+'\n'+(ROOT/'extension.js').read_text()
    (gee/'SES410_landcover_v0_2c.js').write_text(core,encoding='utf-8',newline='\n')
    ui=(ROOT/'baseline/APP_LANDCOVER_v0_2.js').read_text()
    ui=ui.replace("users/arisol/protected-area-landcover-ses410:SES410_landcover_v0_2",'users/arisol/protected-area-landcover-ses410-v0-2c:SES410_landcover_v0_2c')
    ui=ui.replace("var VERSION = '0.2.0';","var VERSION = '0.2c';")
    ui=ui.replace('Version 0.2 | Two-site development prototype','Version 0.2c | baseline compatibility UI; Satlas runs in the Colab notebook')
    ui='/* v0.2c compatibility entrypoint. Integrated teacher/review/exports UI: SES410_v0_2c.ipynb. */\n'+ui
    (gee/'APP_LANDCOVER_v0_2c.js').write_text(ui,encoding='utf-8',newline='\n')
    files=SOURCES+['gee/SES410_landcover_v0_2c.js','gee/APP_LANDCOVER_v0_2c.js']
    memory=io.BytesIO()
    with zipfile.ZipFile(memory,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(files):
            info=zipfile.ZipInfo(name,date_time=(2026,11,4,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,(ROOT/name).read_bytes())
    payload=memory.getvalue();digest=hashlib.sha256(payload).hexdigest()
    code=f'''import base64, hashlib, io, sys, zipfile
from pathlib import Path
payload = base64.b64decode({base64.b64encode(payload).decode()!r})
assert hashlib.sha256(payload).hexdigest() == {digest!r}, "Package hash mismatch"
root = Path('/content/SES410_v02c')
root.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(io.BytesIO(payload)) as archive:
    for name in archive.namelist():
        assert (root/name).resolve().is_relative_to(root.resolve()), "Unsafe package path"
    archive.extractall(root)
sys.path.insert(0, str(root))
from bootstrap import install
install(root)
'''
    notebook={'nbformat':4,'nbformat_minor':5,'metadata':{'colab':{'name':'SES410_v0_2c.ipynb'},
              'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'}},
              'cells':[{'cell_type':'markdown','metadata':{},'source':['# SES410 Hammer v0.2c\n','Experimental c-branch of v0.2. Select a GPU runtime, then **Runtime → Run all**.\n',
              'The interface below keeps mapping, teacher proposals, training review and exports on one page. Sign in through Connect Google. Download run/review archives before disconnecting.\n',
              'Colab mode needs no Vertex deployment. Independent final map accuracy remains unestablished.\n']},
              {'cell_type':'code','execution_count':None,'metadata':{},'outputs':[],'source':code.splitlines(keepends=True)},
              {'cell_type':'code','execution_count':None,'metadata':{},'outputs':[],'source':['from ui import launch\n','ses410 = launch()\n']} ]}
    (ROOT/'SES410_v0_2c.ipynb').write_text(json.dumps(notebook,indent=1),encoding='utf-8',newline='\n')
    files+=['SES410_v0_2c.ipynb']
    hashes={name:{'sha256':hashlib.sha256((ROOT/name).read_bytes()).hexdigest(),'bytes':(ROOT/name).stat().st_size} for name in files}
    (ROOT/'MANIFEST.json').write_text(json.dumps({'version':'0.2c','files':hashes},indent=2),encoding='utf-8',newline='\n')
    return files+['MANIFEST.json']

if __name__=='__main__':print(json.dumps(build(),indent=2))
