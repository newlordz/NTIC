# Stage 1: Build Angular frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY NticPlatform.Frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY NticPlatform.Frontend/ .
ARG BREVO_API_KEY
ENV BREVO_API_KEY=$BREVO_API_KEY
RUN npm run build

# Stage 2: Python backend that serves both API and frontend
FROM python:3.12-slim
WORKDIR /app

# Install system deps for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev gcc && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY NticPlatform.Backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY NticPlatform.Backend/app ./app

# Copy frontend dist — main.py resolves to /NticPlatform.Frontend/dist/ntic-frontend/browser in Docker
COPY --from=frontend-build /app/dist/ntic-frontend/browser /NticPlatform.Frontend/dist/ntic-frontend/browser

# Railway provides PORT dynamically
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-5000}"]
