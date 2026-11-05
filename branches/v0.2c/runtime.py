"""Runtime evidence for actual execution; GPU detection never silently claims GPU use."""
import importlib.metadata
import platform
import sys

def environment(torch_module=None, require_gpu=False):
    if torch_module is None:
        import torch as torch_module
    available=bool(torch_module.cuda.is_available())
    if require_gpu and not available:
        raise RuntimeError('No CUDA GPU detected. In Colab choose Runtime > Change runtime type > T4 GPU, reconnect, and Run all. CPU checks do not qualify the GPU workflow.')
    names=['torch','torchvision','numpy','rasterio','earthengine-api','ipywidgets','google-auth']
    versions={}
    for name in names:
        try:versions[name]=importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:versions[name]=None
    return {'python':sys.version,'platform':platform.platform(),'versions':versions,
            'cuda_available':available,'cuda_version':getattr(torch_module.version,'cuda',None),
            'cuda_device_count':torch_module.cuda.device_count() if available else 0,
            'cuda_device_name':torch_module.cuda.get_device_name(0) if available else None}
