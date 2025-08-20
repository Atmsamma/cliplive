# Multi-stage build for Clip Live application
FROM node:20-alpine AS frontend-builder

# Install dependencies for frontend build
WORKDIR /app
COPY package*.json ./
COPY uv.lock pyproject.toml ./
RUN npm ci

# Copy source code and build frontend
COPY . .
RUN npm run build

# Python backend stage
FROM python:3.11-slim AS python-backend

# Install system dependencies for Python backend
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    wget \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install uv for Python package management  
RUN pip install uv

WORKDIR /app

# Copy Python dependencies
COPY pyproject.toml uv.lock ./

# Install Python dependencies
RUN uv sync --frozen

# Copy Python backend code
COPY backend/ ./backend/
COPY gatekeep_and_clip.py ./

# Final application stage
FROM node:20-alpine AS production

# Install ffmpeg and other system dependencies
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    py3-virtualenv \
    curl \
    bash \
    build-base \
    gcc \
    g++ \
    musl-dev \
    linux-headers \
    python3-dev

# Install uv for Python package management using --break-system-packages
RUN pip3 install --break-system-packages uv

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pyproject.toml uv.lock ./

# Install Node.js production dependencies
RUN npm ci --only=production

# Install Python dependencies using uv with proper flags
RUN uv sync --frozen

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/dist ./dist

# Copy application source
COPY server/ ./server/
COPY shared/ ./shared/
COPY backend/ ./backend/
COPY gatekeep_and_clip.py ./
COPY drizzle.config.ts ./

# Create necessary directories
RUN mkdir -p clips temp data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Start the application
CMD ["npm", "start"]
