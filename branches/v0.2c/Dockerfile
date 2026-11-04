FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir fastapi==0.115.12 uvicorn==0.34.2 requests==2.32.3 scikit-image==0.25.2
COPY config.json teacher.py vertex_server.py /app/
ENV SES410_MODEL_CACHE=/opt/models
# Bake full trained checkpoint and pinned source into the image. No runtime downloads needed.
RUN python -c "from teacher import SatlasTeacher; SatlasTeacher(device='cpu')"
EXPOSE 8080
CMD ["python", "vertex_server.py"]
