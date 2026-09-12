FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
ARG CACHEBURST=1
COPY frontend/ ./frontend/

ENV DATABASE_PATH=/data/requests.db
ENV ENVIRONMENT=production
ENV DEBUG=false
ENV CORS_ORIGINS=*

RUN mkdir -p /data

EXPOSE 8000

CMD ["uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8000"]
