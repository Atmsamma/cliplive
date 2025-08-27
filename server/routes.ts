import type { Express, Response as ExpressResponse } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import passport, { requireAuth } from "./auth";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { insertStreamSessionSchema, insertClipSchema, insertUserSchema, type ProcessingStatus, type SSEEvent, type StreamSession } from "@shared/schema";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import crypto from "crypto";
import { registerSessionRoutes } from "./session-routes";

interface SessionData {
  userId?: number;
  sessionToken: string;
  createdAt: Date;
  lastActivity: Date;
}

const activeSessions = new Map<string, SessionData>();

// Generate session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function sessionMiddleware(req: any, res: any, next: any) {
  const token = req.headers['x-session-token'] || req.query.sessionToken;
  if (token && activeSessions.has(token)) {
    const session = activeSessions.get(token)!;
    session.lastActivity = new Date();
    req.sessionToken = token;
    req.sessionData = session;
  }
  next();
}

interface SessionProcessingState {
  processingStatus: ProcessingStatus;
  streamProcessor: ChildProcess | null;
  sessionStartTime: Date | null;
  sseClients: Set<ExpressResponse>;
}

const sessionStates = new Map<string, SessionProcessingState>();

function getSessionState(sessionToken: string): SessionProcessingState {
  if (!sessionStates.has(sessionToken)) {
    sessionStates.set(sessionToken, {
      processingStatus: {
        isProcessing: false,
        framesProcessed: 0,
        streamUptime: "00:00:00",
        audioLevel: 0,
        motionLevel: 0,
        sceneChange: 0,
      },
      streamProcessor: null,
      sessionStartTime: null,
      sseClients: new Set<ExpressResponse>(),
    });
  }
  return sessionStates.get(sessionToken)!;
}

function broadcastSSE(sessionToken: string, event: SSEEvent) {
  const sessionState = getSessionState(sessionToken);
  const data = `data: ${JSON.stringify(event)}\n\n`;
  
  sessionState.sseClients.forEach(client => {
    try {
      client.write(data);
    } catch (error) {
      sessionState.sseClients.delete(client);
    }
  });
}

function startStreamProcessor(sessionToken: string, config: any): boolean {
  try {
    const sessionState = getSessionState(sessionToken);
    
    // Stop any existing processor for this session
    stopStreamProcessor(sessionToken);

    // Use UV to run Python with all packages available
    const uvCommand = 'uv';
    const scriptPath = path.join(process.cwd(), 'backend', 'stream_processor.py');
    const configJson = JSON.stringify({
      ...config,
      sessionToken, // Pass session token to Python processor
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`Starting stream processor for session ${sessionToken} with config: ${configJson}`);
    }

    sessionState.streamProcessor = spawn(uvCommand, ['run', 'python', scriptPath, configJson], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    if (sessionState.streamProcessor.stdout) {
      sessionState.streamProcessor.stdout.on('data', (data) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[StreamProcessor-${sessionToken}]: ${data.toString().trim()}`);
        }
      });
    }

    if (sessionState.streamProcessor.stderr) {
      sessionState.streamProcessor.stderr.on('data', (data) => {
        console.error(`[StreamProcessor-${sessionToken} Error]: ${data.toString().trim()}`);
      });
    }

    sessionState.streamProcessor.on('exit', (code) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Stream processor for session ${sessionToken} exited with code: ${code}`);
      }
      if (sessionState.processingStatus.isProcessing) {
        sessionState.processingStatus.isProcessing = false;
        broadcastSSE(sessionToken, {
          type: 'session-stopped',
          data: { message: 'Stream processor stopped unexpectedly' },
        });
      }
    });

    sessionState.streamProcessor.on('error', (error) => {
      console.error(`Stream processor error for session ${sessionToken}: ${error}`);
    });

    return true;
  } catch (error) {
    console.error(`Failed to start stream processor for session ${sessionToken}: ${error}`);
    return false;
  }
}

function stopStreamProcessor(sessionToken: string) {
  const sessionState = getSessionState(sessionToken);
  if (sessionState.streamProcessor) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`Stopping stream processor for session ${sessionToken}...`);
    }
    sessionState.streamProcessor.kill('SIGTERM');
    sessionState.streamProcessor = null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Register new session-based routes
  registerSessionRoutes(app);

  // Configure session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Initialize passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Ensure clips directory exists
  const clipsDir = path.join(process.cwd(), 'clips');
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true });
  }

  // Clean up any orphaned clip files and thumbnails on startup
  try {
    const existingFiles = fs.readdirSync(clipsDir).filter(file => file.endsWith('.mp4'));
    if (process.env.NODE_ENV === 'development') {
      console.log(`Found ${existingFiles.length} existing clip files, cleaning up...`);
    }

    // For development, remove old files to start fresh
    existingFiles.forEach(file => {
      const filePath = path.join(clipsDir, file);
      fs.unlinkSync(filePath);
    });

    // Also clean up thumbnails
    const thumbnailsDir = path.join(clipsDir, 'thumbnails');
    if (fs.existsSync(thumbnailsDir)) {
      const existingThumbnails = fs.readdirSync(thumbnailsDir).filter(file => file.endsWith('.jpg'));
      if (process.env.NODE_ENV === 'development') {
        console.log(`Found ${existingThumbnails.length} existing thumbnail files, cleaning up...`);
      }

      existingThumbnails.forEach(thumbnail => {
        const thumbnailPath = path.join(thumbnailsDir, thumbnail);
        fs.unlinkSync(thumbnailPath);
      });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Clip directory and thumbnails cleaned');
    }
  } catch (error) {
    console.error('Error cleaning clip directory:', error);
  }

  // LEGACY ENDPOINT REMOVED - Use /api/sessions/{sessionId}/events instead

  // Authentication routes
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password!, 10);
      
      // Create user
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword,
      });

      // Log the user in automatically and create session token
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to log in after signup' });
        }
        
        const sessionToken = generateSessionToken();
        activeSessions.set(sessionToken, {
          userId: user.id,
          sessionToken,
          createdAt: new Date(),
          lastActivity: new Date(),
        });
        
        res.json({ 
          message: 'User created and logged in successfully', 
          user,
          sessionToken 
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/auth/signin', passport.authenticate('local'), (req, res) => {
    const sessionToken = generateSessionToken();
    activeSessions.set(sessionToken, {
      userId: (req.user as any).id,
      sessionToken,
      createdAt: new Date(),
      lastActivity: new Date(),
    });
    
    res.json({ 
      message: 'Signed in successfully', 
      user: req.user,
      sessionToken 
    });
  });

  app.post('/api/auth/signout', sessionMiddleware, (req, res) => {
    if (req.sessionToken) {
      activeSessions.delete(req.sessionToken);
      // Clean up session state
      sessionStates.delete(req.sessionToken);
    }
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to sign out' });
      }
      res.json({ message: 'Signed out successfully' });
    });
  });

  // Google OAuth routes (only if credentials are configured)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    app.get('/api/auth/google', passport.authenticate('google', {
      scope: ['profile', 'email']
    }));

    app.get('/api/auth/google/callback', 
      passport.authenticate('google', { failureRedirect: '/signin' }),
      (req, res) => {
        res.redirect('/capture');
      }
    );
  } else {
    app.get('/api/auth/google', (req, res) => {
      res.status(501).json({ error: 'Google OAuth not configured' });
    });
    
    app.get('/api/auth/google/callback', (req, res) => {
      res.status(501).json({ error: 'Google OAuth not configured' });
    });
  }

  app.get('/api/user', requireAuth, (req, res) => {
    res.json(req.user);
  });

  // Health check endpoint for Docker
  app.get("/api/health", (req, res) => {
    res.status(200).json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // LEGACY ENDPOINT REMOVED - Use /api/sessions/{sessionId}/status instead



  // LEGACY ENDPOINT REMOVED - Use /api/sessions/{sessionId}/start instead

  // LEGACY ENDPOINT REMOVED - Use /api/sessions/{sessionId}/stop instead

  // LEGACY ENDPOINT REMOVED - Use /api/sessions/{sessionId}/clips instead



  // LEGACY ENDPOINT REMOVED - Use /api/sessions/{sessionId}/clips/{id} instead

  // LEGACY ENDPOINT REMOVED - Use /api/sessions/{sessionId}/clips/{id} instead

  app.get("/clips/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(process.cwd(), "clips", filename);

    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  });

  app.get("/api/thumbnails/:filename", async (req, res) => {
    try {
      const filename = req.params.filename;
      const thumbnailPath = path.join(process.cwd(), 'clips', 'thumbnails', filename.replace('.mp4', '.jpg'));

      if (fs.existsSync(thumbnailPath)) {
        res.sendFile(thumbnailPath);
      } else {
        // Generate thumbnail if it doesn't exist
        const clipPath = path.join(process.cwd(), 'clips', filename);
        if (fs.existsSync(clipPath)) {
          await generateThumbnail(clipPath, thumbnailPath);
          res.sendFile(thumbnailPath);
        } else {
          res.status(404).json({ error: 'Clip not found' });
        }
      }
    } catch (error) {
      console.error('Error serving thumbnail:', error);
      res.status(500).json({ error: 'Failed to serve thumbnail' });
    }
  });

  // Download all clips as ZIP
  app.get('/api/download-all', async (req, res) => {
    try {
      const clips = await storage.getClips();
      if (clips.length === 0) {
        return res.status(400).json({ error: 'No clips to download' });
      }

      // For now, just return the list of clips
      // In a real implementation, you'd create a ZIP file
      res.json({
        message: 'ZIP download would be implemented here',
        clips: clips.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create download' });
    }
  });

  // LEGACY ENDPOINT REMOVED - Use /api/sessions/{sessionId}/clips instead

  // Internal API for Python processor to send metrics updates with session context
  app.post('/api/internal/metrics', sessionMiddleware, async (req, res) => {
    try {
      if (!req.sessionToken) {
        return res.status(401).json({ error: 'Session token required' });
      }
      
      const sessionState = getSessionState(req.sessionToken);
      const metricsData = req.body;

      // Update uptime if session is active
      if (sessionState.sessionStartTime && metricsData.isProcessing) {
        const uptime = Date.now() - sessionState.sessionStartTime.getTime();
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
        metricsData.streamUptime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }

      // Update session-specific processing status
      sessionState.processingStatus = { ...sessionState.processingStatus, ...metricsData };

      // Broadcast updated metrics via SSE to this session only
      broadcastSSE(req.sessionToken, {
        type: 'processing-status',
        data: sessionState.processingStatus,
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating metrics:', error);
      res.status(500).json({ error: 'Failed to update metrics' });
    }
  });

  // Get resolved stream URL for display with session context
  app.get('/api/stream-url', sessionMiddleware, async (req, res) => {
    try {
      if (!req.sessionToken) {
        return res.status(401).json({ error: 'Session token required' });
      }

      const activeSession = await storage.getActiveSessionByToken(req.sessionToken);
      if (!activeSession) {
        console.log(`❌ No active session found for session token ${req.sessionToken}`);
        return res.status(404).json({ error: 'No active session found for this token' });
      }

      console.log(`🔗 Resolving stream URL for display: ${activeSession.url}`);

      // Extract channel name from URL for Ad Gatekeeper
      let resolvedStreamUrl = null;
      let channel_name = null;

      if (activeSession.url.includes('twitch.tv/')) {
        try {
          const urlParts = activeSession.url.split('twitch.tv/');
          if (urlParts.length > 1) {
            channel_name = urlParts[1].split('/')[0].split('?')[0];
            console.log(`📺 Extracted channel name: ${channel_name}`);
          }
        } catch (error) {
          console.log('Error parsing Twitch channel name:', error);
        }
      }

      // Use Ad Gatekeeper if available and we have a channel name
      if (channel_name) {
        try {
          // For now, skip Ad Gatekeeper in TypeScript context and go directly to streamlink
          console.log('⚠️ Skipping Ad Gatekeeper (Python module), using streamlink directly');
        } catch (error) {
          console.log('⚠️ Ad Gatekeeper error for display, using streamlink fallback:', error.message);
        }
      }

      // Fallback to streamlink if Ad Gatekeeper fails
      console.log('🔄 Using streamlink to resolve URL for display');
      
      return new Promise((resolve, reject) => {
        let responsesent = false; // Flag to prevent multiple responses
        
        const streamlinkProcess = spawn('streamlink', [
          activeSession.url,
          'best',
          '--stream-url',
          '--retry-streams', '2',
          '--retry-max', '3'
        ], {
          timeout: 30000
        });

        let streamUrl = '';
        let errorOutput = '';

        streamlinkProcess.stdout.on('data', (data) => {
          streamUrl += data.toString();
        });

        streamlinkProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        streamlinkProcess.on('close', (code) => {
          if (responsesent) return;
          responsesent = true;
          
          if (code === 0 && streamUrl.trim()) {
            const cleanUrl = streamUrl.trim();
            console.log(`✅ Streamlink resolved URL for display: ${cleanUrl.substring(0, 80)}...`);
            res.json({ resolvedStreamUrl: cleanUrl });
            resolve(null);
          } else {
            console.error(`❌ Streamlink failed for display (code: ${code})`);
            console.error(`❌ Streamlink stderr: ${errorOutput}`);
            res.status(500).json({ 
              error: 'Failed to resolve stream URL for display',
              details: `Streamlink exit code: ${code}`,
              stderr: errorOutput.substring(0, 200)
            });
            resolve(null);
          }
        });

        streamlinkProcess.on('error', (error) => {
          if (responsesent) return;
          responsesent = true;
          
          console.error(`❌ Streamlink process error for display: ${error}`);
          res.status(500).json({ 
            error: 'Stream URL resolution process failed',
            details: error.message 
          });
          resolve(null);
        });
      });

    } catch (error) {
      console.error('❌ Error getting stream URL for display:', error);
      res.status(500).json({ 
        error: 'Failed to get stream URL',
        details: error.message 
      });
    }
  });

  // Internal stream ended notification endpoint with session context
  app.post('/api/internal/stream-ended', sessionMiddleware, async (req, res) => {
    const { url, endTime, totalClips, totalDuration, lastSuccessfulCapture } = req.body;

    if (!req.sessionToken) {
      return res.status(401).json({ error: 'Session token required' });
    }

    console.log(`Stream ended notification for session ${req.sessionToken}: ${url} after ${totalDuration}s with ${totalClips} clips`);

    // Stop the stream processor for this session
    stopStreamProcessor(req.sessionToken);

    // Update active session status in database
    try {
      const activeSession = await storage.getActiveSessionByToken(req.sessionToken);
      if (activeSession) {
        await storage.updateSessionStatus(activeSession.id, false);
      }
    } catch (error) {
      console.error('Error updating session status on stream end:', error);
    }

    // Reset session-specific processing status
    const sessionState = getSessionState(req.sessionToken);
    sessionState.processingStatus = {
      isProcessing: false,
      framesProcessed: 0,
      streamUptime: "00:00:00",
      audioLevel: 0,
      motionLevel: 0,
      sceneChange: 0,
    };
    sessionState.sessionStartTime = null;

    // Notify connected clients for this session
    broadcastSSE(req.sessionToken, {
      type: 'stream-ended',
      data: {
        message: `Stream has ended after ${Math.round(totalDuration / 60)} minutes`,
        url,
        totalClips,
        totalDuration: Math.round(totalDuration),
        endTime: new Date(endTime * 1000).toISOString(),
      },
    });

    // Also broadcast the reset status for this session
    broadcastSSE(req.sessionToken, {
      type: 'processing-status',
      data: sessionState.processingStatus,
    });

    res.json({ success: true });
  });

  


  const httpServer = createServer(app);
  return httpServer;
}

// Dummy function for thumbnail generation if not defined elsewhere
async function generateThumbnail(clipPath: string, thumbnailPath: string) {
  console.log(`Generating thumbnail for ${clipPath} at ${thumbnailPath}`);
  // In a real application, you would use a library like ffmpeg-static or similar
  // to generate a thumbnail from the video file.
  // For now, we'll just create a placeholder file.
  try {
    fs.writeFileSync(thumbnailPath, 'dummy thumbnail content');
  } catch (error) {
    console.error('Failed to create dummy thumbnail:', error);
  }
}
