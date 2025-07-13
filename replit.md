# Stream Clipper Application

## Overview

This is an automatic livestream highlight capture tool that detects exciting moments from public streams and creates video clips. The application features a dual backend architecture with real-time processing capabilities and a modern React frontend.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: Comprehensive set of Radix UI primitives with custom styling

### Backend Architecture
- **Primary Server**: Express.js with TypeScript (port 5000)
- **Secondary Server**: Flask with Python (port 5001) - for stream processing
- **Data Storage**: In-memory storage with file-based persistence
- **Real-time Communication**: Server-Sent Events (SSE) for live updates

### Key Design Decisions

1. **FFmpeg Integration with 20%/80% Clipping Strategy**: Implemented precise video clipping where 20% of the clip captures content before the highlight detection moment and 80% captures content after. This provides better context for viewers while centering on the most exciting moments.

2. **Python Stream Processor**: Created a robust Python backend that uses FFmpeg for real video analysis and clipping, with proper stream buffering and segment management for optimal performance.

3. **Dual Backend Approach**: Express.js handles the main API while a separate Python stream processor manages real-time video processing with FFmpeg and Streamlink integration.

4. **Real-time Communication**: Added internal API endpoints for the Python processor to communicate clip creation and metrics updates back to the main server via Server-Sent Events.

## Key Components

### Frontend Components
- **Stream Input Form**: Captures stream URLs and configuration parameters
- **Processing Status**: Real-time display of stream processing metrics
- **Clip Library**: Management interface for captured clips
- **Sidebar Navigation**: Application navigation with live status indicators

### Backend Services
- **Stream Session Management**: Handles active streaming sessions
- **Clip Storage**: File-based clip management with metadata
- **SSE Event Broadcasting**: Real-time updates to connected clients
- **Mock Processing**: Simulated highlight detection for development

### Shared Schema
- **Database Schema**: Drizzle ORM with PostgreSQL dialect (configured but using in-memory storage)
- **Type Safety**: Shared TypeScript types between frontend and backend
- **Validation**: Zod schemas for API requests and responses

## Data Flow

1. **Stream Input**: User submits stream URL through React form
2. **Session Creation**: Express server creates stream session record
3. **Processing Trigger**: Background Python worker (Flask) begins stream analysis
4. **Highlight Detection**: Python processor uses FFmpeg to analyze video segments for audio spikes, motion, and scene changes in real-time
5. **Clip Generation**: When highlights are detected, FFmpeg creates clips using the 20%/80% strategy - 20% of content before the detection moment and 80% after, providing optimal context
6. **Real-time Updates**: SSE broadcasts processing status and new clips
7. **Clip Management**: Users can view, download, and manage captured clips

## External Dependencies

### Core Technologies
- **FFmpeg**: Required in PATH for video processing
- **Streamlink**: CLI tool for multi-platform stream capture (Twitch, YouTube, Kick, HLS)
- **Neon Database**: PostgreSQL serverless provider (configured via `@neondatabase/serverless`)

### Development Tools
- **Drizzle Kit**: Database migration and schema management
- **ESBuild**: Server bundling for production
- **Replit Integration**: Development environment optimizations

## Deployment Strategy

### Development
- Concurrent development servers: Vite (frontend) + Express (backend)
- Hot module replacement for rapid development
- Mock data and simulated processing for testing

### Production
- **Build Process**: Vite builds frontend to `dist/public`, ESBuild bundles server
- **File Structure**: 
  - `/clips/` - Runtime video storage
  - `/dist/` - Built frontend and server
  - `/migrations/` - Database migration files
- **Environment Variables**: `DATABASE_URL` for PostgreSQL connection

### Key Configuration Files
- `vite.config.ts`: Frontend build configuration with path aliases
- `drizzle.config.ts`: Database configuration and migration settings
- `tsconfig.json`: Unified TypeScript configuration for all packages
- `tailwind.config.ts`: Styling configuration with dark theme support

## Technical Specifications

### Highlight Detection Thresholds
- **Audio**: ≥6dB volume change threshold
- **Motion**: ≥30% frame change detection
- **Scene Change**: >0.4 score threshold
- **Clip Length**: 20-second duration using 20%/80% strategy

### FFmpeg Clipping Strategy
- **Before Detection**: 20% of clip duration (4 seconds for 20s clips) captures lead-up context
- **After Detection**: 80% of clip duration (16 seconds for 20s clips) captures the exciting moment and aftermath
- **Stream Buffer**: 30-second circular buffer maintains recent segments for immediate clipping
- **Segment Duration**: 2-second segments for precise timing control

### Real-time Features
- Server-Sent Events for live status updates
- Toast notifications for highlight captures
- Live processing metrics (frames processed, uptime, audio/motion levels)
- Automatic clip library refresh