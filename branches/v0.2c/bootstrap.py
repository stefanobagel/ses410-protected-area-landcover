"""Install into a Colab runtime; source package carries no credentials or private data."""
from pathlib import Path
import hashlib
import io
import os
import shutil
import subprocess
import sys
import tarfile
import urllib.request

def install(root):
    root=Path(root)
    subprocess.check_call([sys.executable,'-m','pip','install','--quiet','-r',str(root/'requirements.txt')])
    node=shutil.which('node');npm=shutil.which('npm')
    if not node or not npm:
        if sys.platform != 'linux':raise RuntimeError('Install Node.js 18+ and npm, then rerun bootstrap.')
        version='v22.16.0';name='node-'+version+'-linux-x64.tar.xz'
        base='https://nodejs.org/dist/'+version+'/'
        data=urllib.request.urlopen(base+name,timeout=120).read()
        sums=urllib.request.urlopen(base+'SHASUMS256.txt',timeout=30).read().decode()
        expected=next(line.split()[0] for line in sums.splitlines() if line.split()[-1]==name)
        if hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('Node archive hash mismatch.')
        target=root/'.runtime';target.mkdir(exist_ok=True)
        with tarfile.open(fileobj=io.BytesIO(data),mode='r:xz') as tar:tar.extractall(target,filter='data')
        os.environ['PATH']=str(target/('node-'+version+'-linux-x64')/'bin')+os.pathsep+os.environ['PATH']
        npm=shutil.which('npm')
    subprocess.check_call([npm,'install','--ignore-scripts','--no-audit','--no-fund'],cwd=root)
    try:
        from google.colab import output
        output.enable_custom_widget_manager()
    except ImportError:
        pass
    print('v0.2c dependencies ready. Use the controls below; Google authentication happens when you connect.')
