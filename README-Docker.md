# Clip Live - Docker Setup

Clip Live is a real-time stream highlighting application that captures exciting moments from live streams using AI detection.

## Quick Start with Docker

### Prerequisites
- Docker and Docker Compose installed
- At least 4GB of available RAM
- 10GB of available disk space

### 1. Clone and Setup
```bash
git clone <repository-url>
cd clipLive
```

### 2. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit the .env file with your preferred settings
# The default values will work for local development
```

### 3. Start the Application

#### For Production:
```bash
docker-compose up -d
```

#### For Development (with hot reload):
```bash
docker-compose -f docker-compose.dev.yml up -d
```

### 4. Initialize Database
```bash
# Run database migrations
docker-compose exec app npm run db:push
```

### 5. Access the Application
- **Web Interface**: http://localhost:5000
- **API**: http://localhost:5000/api
- **Health Check**: http://localhost:5000/api/health

## Services

### Main Application (Port 5000)
- **Frontend**: React/TypeScript with Vite
- **Backend**: Express.js server
- **Python Backend**: Stream processing with AI detection

### PostgreSQL Database (Port 5432)
- Stores user data, clips metadata, and stream sessions
- Data is persisted in Docker volume `postgres_data`

### Redis (Port 6379)
- Session storage and caching
- Optional service for better session management

## Directory Structure

```
clipLive/
├── client/           # React frontend
├── server/           # Express.js backend
├── backend/          # Python stream processing
├── shared/           # Shared TypeScript schemas
├── clips/            # Generated video clips (mounted volume)
├── data/             # Application data (mounted volume)
└── temp/             # Temporary files (mounted volume)
```

## Available Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild and start
docker-compose up --build -d

# Access application shell
docker-compose exec app /bin/bash

# Run database migrations
docker-compose exec app npm run db:push

# Development mode with hot reload
docker-compose -f docker-compose.dev.yml up -d
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://cliplive:cliplive_password@postgres:5432/cliplive` |
| `SESSION_SECRET` | Secret key for session encryption | `your-super-secret-session-key-change-this-in-production` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `NODE_ENV` | Application environment | `production` |
| `PORT` | Application port | `5000` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (optional) | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (optional) | - |

## Volumes

- `postgres_data`: PostgreSQL database files
- `./clips`: Video clip files
- `./data`: Application data files
- `./temp`: Temporary processing files

## Troubleshooting

### Common Issues

1. **Port conflicts**: Make sure ports 5000, 5432, and 6379 are not in use
2. **Memory issues**: Ensure Docker has at least 4GB RAM allocated
3. **Permission issues**: Make sure Docker has access to the project directory

### Useful Commands

```bash
# Check service status
docker-compose ps

# View service logs
docker-compose logs app
docker-compose logs postgres

# Restart a service
docker-compose restart app

# Clean up everything (including volumes)
docker-compose down -v
docker system prune -a
```

### Reset Database
```bash
docker-compose down -v
docker-compose up -d postgres
docker-compose exec app npm run db:push
```

## Development

For development with hot reload and file watching:

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# The application will be available at:
# - Frontend dev server: http://localhost:5173
# - Backend API: http://localhost:5000/api
```

## Production Deployment

1. Update environment variables in `.env`
2. Change default passwords and secrets
3. Configure proper SSL/TLS termination
4. Set up proper backup strategy for PostgreSQL
5. Configure log aggregation
6. Set up monitoring and alerts

## Support

For issues and questions, please check the project documentation or create an issue in the repository.
