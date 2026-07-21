FROM python:3.11.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Copy frontend build (if available)
COPY frontend/dist /app/frontend/dist 2>/dev/null || true

# Expose port
EXPOSE 8000

# Start server
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
