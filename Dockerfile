FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Install system dependencies for Tesseract OCR, PyMuPDF, and OpenCV headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Ensure necessary runtime directories exist
RUN mkdir -p uploads database chroma_db

EXPOSE 8000

# Respect dynamic PORT variable provided by Render / cloud platforms
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
