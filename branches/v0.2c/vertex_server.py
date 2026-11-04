"""Vertex custom container protocol. Same trained teacher as Colab; no public auth bypass."""
import base64
import binascii
import io
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

teacher = None

@asynccontextmanager
async def lifespan(app):
    global teacher
    from teacher import SatlasTeacher
    teacher = SatlasTeacher()
    yield

app = FastAPI(lifespan=lifespan)

class Instance(BaseModel):
    rgb_png: str = Field(max_length=1500000)
    row: int = Field(default=256,ge=0,lt=512)
    col: int = Field(default=256,ge=0,lt=512)

class Request(BaseModel):
    instances: list[Instance] = Field(min_length=1,max_length=1)

@app.get('/health')
def health():
    if teacher is None: raise HTTPException(status_code=503,detail='Model loading')
    return {'status':'ready','source_commit':teacher.identity['source_commit']}

@app.post('/predict')
def predict(body: Request):
    import numpy as np
    from PIL import Image
    if teacher is None:raise HTTPException(status_code=503,detail='Model loading')
    answers = []
    for item in body.instances:
        try:
            raw = base64.b64decode(item.rgb_png,validate=True)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format != 'PNG' or image.mode != 'RGB' or image.size != (512,512):
                    raise ValueError('Expected 512 x 512 RGB PNG.')
                rgb = np.array(image)
            answers.append(teacher.predict(rgb,item.row,item.col))
        except (ValueError,binascii.Error,OSError) as exc:
            raise HTTPException(status_code=400,detail=str(exc)) from exc
    return {'predictions':answers}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app,host='0.0.0.0',port=int(os.environ.get('AIP_HTTP_PORT','8080')))
