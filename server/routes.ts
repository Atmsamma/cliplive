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

// Processing state - ensure completely reset
let processingStatus: ProcessingStatus = {
  isProcessing: false,
  framesProcessed: 0,
  streamUptime: "00:00:00",
  audioLevel: 0,
  motionLevel: 0,
  sceneChange: 0,
};

// SSE clients
const sseClients = new Set<ExpressResponse>();

// Multiple Python stream processors - keyed by session ID
const streamProcessors = new Map<number, ChildProcess>();
const sessionStartTimes = new Map<number, Date>();

function broadcastSSE(event: SSEEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.write(data);
    } catch (error) {
      sseClients.delete(client);
    }
  });
}

function startStreamProcessor(config: any): boolean {
  try {
    const sessionId = config.sessionId;
    
    // Stop any existing processor for this session
    stopStreamProcessor(sessionId);

    const pythonPath = 'python3';
    const scriptPath = path.join(process.cwd(), 'backend', 'stream_processor.py');
    const configJson = JSON.stringify(config);

    console.log(`Starting stream processor for session ${sessionId} with config: ${configJson}`);

    const processor = spawn(pythonPath, [scriptPath, configJson], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    if (processor.stdout) {
      processor.stdout.on('data', (data) => {
        console.log(`[StreamProcessor-${sessionId}]: ${data.toString().trim()}`);
      });
    }

    if (processor.stderr) {
      processor.stderr.on('data', (data) => {
        console.error(`[StreamProcessor-${sessionId} Error]: ${data.toString().trim()}`);
      });
    }

    processor.on('exit', (code) => {
      console.log(`Stream processor ${sessionId} exited with code: ${code}`);
      streamProcessors.delete(sessionId);
      sessionStartTimes.delete(sessionId);
      
      broadcastSSE({
        type: 'session-stopped',
        data: { message: `Stream processor ${sessionId} stopped`, sessionId },
      });
    });

    processor.on('error', (error) => {
      console.error(`Stream processor ${sessionId} error: ${error}`);
      streamProcessors.delete(sessionId);
      sessionStartTimes.delete(sessionId);
    });

    streamProcessors.set(sessionId, processor);
    sessionStartTimes.set(sessionId, new Date());

    return true;
  } catch (error) {
    console.error(`Failed to start stream processor: ${error}`);
    return false;
  }
}

function stopStreamProcessor(sessionId?: number) {
  if (sessionId) {
    // Stop specific session processor
    const processor = streamProcessors.get(sessionId);
    if (processor) {
      console.log(`Stopping stream processor for session ${sessionId}...`);
      processor.kill('SIGTERM');
      streamProcessors.delete(sessionId);
      sessionStartTimes.delete(sessionId);
    }
  } else {
    // Stop all processors (legacy support)
    console.log('Stopping all stream processors...');
    streamProcessors.forEach((processor, id) => {
      processor.kill('SIGTERM');
    });
    streamProcessors.clear();
    sessionStartTimes.clear();
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
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
    console.log(`Found ${existingFiles.length} existing clip files, cleaning up...`);

    // For development, remove old files to start fresh
    existingFiles.forEach(file => {
      const filePath = path.join(clipsDir, file);
      fs.unlinkSync(filePath);
    });

    // Also clean up thumbnails
    const thumbnailsDir = path.join(clipsDir, 'thumbnails');
    if (fs.existsSync(thumbnailsDir)) {
      const existingThumbnails = fs.readdirSync(thumbnailsDir).filter(file => file.endsWith('.jpg'));
      console.log(`Found ${existingThumbnails.length} existing thumbnail files, cleaning up...`);

      existingThumbnails.forEach(thumbnail => {
        const thumbnailPath = path.join(thumbnailsDir, thumbnail);
        fs.unlinkSync(thumbnailPath);
      });
    }

    console.log('✅ Clip directory and thumbnails cleaned');
  } catch (error) {
    console.error('Error cleaning clip directory:', error);
  }

  // Server-Sent Events endpoint
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    sseClients.add(res);

    // Send initial status
    res.write(`data: ${JSON.stringify({
      type: 'processing-status',
      data: processingStatus,
    })}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Authentication routes
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { name, email, password } = req.body;

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists with this email' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        name,
        email,
        password: hashedPassword
      });

      res.json({ message: 'User created successfully', userId: user.id });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.post('/api/auth/signin', passport.authenticate('local'), (req, res) => {
    res.json({ message: 'Signed in successfully', user: req.user });
  });

  app.post('/api/auth/signout', (req, res) => {
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

  // Get processing status
  app.get("/api/status", (req, res) => {
    res.json(processingStatus);
  });

  // Initialize endpoint - no longer stops existing sessions, allows multiple concurrent sessions
  app.get("/api/auto-start", async (req, res) => {
    try {
      console.log('🚀 Client connected - ready to start new session if needed');
      res.json({ success: true, message: 'Ready for new session' });
    } catch (error) {
      console.error('Error initializing client:', error);
      res.status(500).json({ error: 'Failed to initialize client' });
    }
  });



  // Start stream capture
  app.post('/api/start', async (req, res) => {
    try {
      // Add userId from authenticated user to the request data, or use null for unauthenticated users
      const requestData = {
        ...req.body,
        userId: req.user ? (req.user as any).id : null
      };
      
      const validatedData = insertStreamSessionSchema.parse(requestData);

      // Don't stop other sessions - allow multiple concurrent sessions
      console.log('🚀 Starting new concurrent session...');

      // Clean up temp directory and old session artifacts before starting new session
      try {
        console.log('🧹 Cleaning temp directory before starting new session...');

        const tempDir = path.join(process.cwd(), 'temp');
        if (fs.existsSync(tempDir)) {
          const tempFiles = fs.readdirSync(tempDir);
          tempFiles.forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
              fs.unlinkSync(filePath);
              console.log(`✅ Deleted temp file: ${file}`);
            } catch (err) {
              console.warn(`Could not delete temp file ${file}:`, err.message);
            }
          });
        } else {
          // Create temp directory if it doesn't exist
          fs.mkdirSync(tempDir, { recursive: true });
        }

        console.log('✅ Temp directory cleaned for new session');
      } catch (cleanupError) {
        console.error('Error cleaning temp directory:', cleanupError);
      }

      // Create new session
      const session = await storage.createStreamSession({
        ...validatedData,
        isActive: true,
      });

      // Start Python stream processor with real FFmpeg integration
      const processorConfig = {
        url: session.url,
        audioThreshold: session.audioThreshold,
        motionThreshold: session.motionThreshold,
        clipLength: session.clipLength,
        sessionId: session.id,
      };

      console.log('🚀 Starting stream processor with config:', processorConfig);
      const started = startStreamProcessor(processorConfig);

      if (started) {
        // Update processing status
        processingStatus.isProcessing = true;
        processingStatus.framesProcessed = 0;
        processingStatus.currentSession = session;
        sessionStartTime = new Date();

        console.log('✅ Stream processor started successfully');
        console.log('📊 Current processing status:', processingStatus);

        broadcastSSE({
          type: 'session-started',
          data: session,
        });

        res.json(session);
      } else {
        // Failed to start processor
        console.log('❌ Failed to start stream processor');
        await storage.updateSessionStatus(session.id, false);
        res.status(500).json({ error: 'Failed to start stream processor' });
      }
    } catch (error) {
      console.error('Error starting stream capture:', error);
      res.status(400).json({ error: 'Invalid request data' });
    }
  });

  // Stop stream capture
  app.post('/api/stop', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      const updatedSession = await storage.updateSessionStatus(sessionId, false);
      if (!updatedSession) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Stop specific Python stream processor
      stopStreamProcessor(sessionId);

      // Comprehensive cleanup of all session artifacts
      try {
        console.log('🧹 Starting comprehensive session cleanup...');

        // 1. Clean up thumbnails from this session
        const thumbnailsDir = path.join(process.cwd(), 'clips', 'thumbnails');
        if (fs.existsSync(thumbnailsDir)) {
          const thumbnails = fs.readdirSync(thumbnailsDir).filter(file => file.endsWith('.jpg'));
          console.log(`Cleaning up ${thumbnails.length} thumbnail files...`);

          thumbnails.forEach(thumbnail => {
            const thumbnailPath = path.join(thumbnailsDir, thumbnail);
            fs.unlinkSync(thumbnailPath);
          });

          console.log('✅ Thumbnails cleaned up successfully');
        }

        // 2. Clean up temporary files and current frame
        const tempDir = path.join(process.cwd(), 'temp');
        if (fs.existsSync(tempDir)) {
          const tempFiles = fs.readdirSync(tempDir);
          console.log(`Cleaning up ${tempFiles.length} temporary files...`);

          tempFiles.forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
              fs.unlinkSync(filePath);
            } catch (err) {
              console.warn(`Could not delete temp file ${file}:`, err.message);
            }
          });

          console.log('✅ Temporary files cleaned up successfully');
        }

        // 3. Clean up session-specific frames
        const sessionFramePattern = new RegExp(`session_${activeSession.id}_frame\\.jpg`);
        if (fs.existsSync(tempDir)) {
          const sessionFrames = fs.readdirSync(tempDir).filter(file => sessionFramePattern.test(file));
          sessionFrames.forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
              fs.unlinkSync(filePath);
              console.log(`✅ Deleted session frame: ${file}`);
            } catch (err) {
              console.warn(`Could not delete session frame ${file}:`, err.message);
            }
          });
        }

        // 4. Clean up any stream processor artifacts (buckets, segments, etc.)
        // These would be in /tmp/ directories created by the Python processor
        console.log('✅ Stream processor will clean up its own temporary buckets and segments');

        // 5. Reset processing metrics
        processingStatus = {
          isProcessing: false,
          framesProcessed: 0,
          streamUptime: "00:00:00",
          audioLevel: 0,
          motionLevel: 0,
          sceneChange: 0,
        };

        console.log('✅ All session artifacts cleaned up successfully');

      } catch (cleanupError) {
        console.error('Error during session cleanup:', cleanupError);
      }

      // Update processing status
      processingStatus.isProcessing = false;
      processingStatus.currentSession = undefined;
      sessionStartTime = null;

      broadcastSSE({
        type: 'session-stopped',
        data: updatedSession,
      });

      res.json(updatedSession);
    } catch (error) {
      res.status(500).json({ error: 'Failed to stop session' });
    }
  });

  // Get clips
  app.get("/api/clips", async (req, res) => {
    try {
      const clips = await storage.getClips();
      res.json(clips || []);
    } catch (error) {
      console.error('Error fetching clips:', error);
      res.json([]);
    }
  });



  // Get single clip
  app.get('/api/clips/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const clip = await storage.getClip(id);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }
    res.json(clip);
  });

  // Delete clip
  app.delete('/api/clips/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const clip = await storage.getClip(id);
      if (!clip) {
        return res.status(404).json({ error: 'Clip not found' });
      }

      // Delete file
      const filePath = path.join(clipsDir, clip.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete from storage
      await storage.deleteClip(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete clip' });
    }
  });

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

  // Internal API for Python processor to create clips
  app.post('/api/clips', async (req, res) => {
    try {
      const validatedData = insertClipSchema.parse(req.body);
      const clip = await storage.createClip(validatedData);

      // Broadcast SSE event about new clip
      broadcastSSE({
        type: 'clip-generated',
        data: clip,
      });

      res.json(clip);
    } catch (error) {
      console.error('Error creating clip:', error);
      res.status(400).json({ error: 'Invalid clip data' });
    }
  });

  // Internal API for Python processor to send metrics updates
  app.post('/api/internal/metrics', async (req, res) => {
    try {
      // Update processing status with data from Python processor
      const metricsData = req.body;

      // Update uptime if session is active
      if (sessionStartTime && metricsData.isProcessing) {
        const uptime = Date.now() - sessionStartTime.getTime();
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
        metricsData.streamUptime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }

      // Update global processing status
      processingStatus = { ...processingStatus, ...metricsData };

      // Broadcast updated metrics via SSE
      broadcastSSE({
        type: 'processing-status',
        data: processingStatus,
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating metrics:', error);
      res.status(500).json({ error: 'Failed to update metrics' });
    }
  });

  // Get resolved stream URL for display (decoupled from processing)
  app.get('/api/stream-url', async (req, res) => {
    try {
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        console.log('❌ No active session found for stream URL request');
        return res.status(404).json({ error: 'No active session found' });
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

  // Internal stream ended notification endpoint
  app.post('/api/internal/stream-ended', async (req, res) => {
    const { url, endTime, totalClips, totalDuration, lastSuccessfulCapture } = req.body;

    console.log(`Stream ended notification: ${url} after ${totalDuration}s with ${totalClips} clips`);

    // Stop the stream processor to ensure clean shutdown
    stopStreamProcessor();

    // Update active session status in database
    try {
      const activeSession = await storage.getActiveSession();
      if (activeSession) {
        await storage.updateSessionStatus(activeSession.id, false);
      }
    } catch (error) {
      console.error('Error updating session status on stream end:', error);
    }

    // Reset processing status completely
    processingStatus = {
      isProcessing: false,
      framesProcessed: 0,
      streamUptime: "00:00:00",
      audioLevel: 0,
      motionLevel: 0,
      sceneChange: 0,
    };
    sessionStartTime = null;

    // Notify all connected clients
    broadcastSSE({
      type: 'stream-ended',
      data: {
        message: `Stream has ended after ${Math.round(totalDuration / 60)} minutes`,
        url,
        totalClips,
        totalDuration: Math.round(totalDuration),
        endTime: new Date(endTime * 1000).toISOString(),
      },
    });

    // Also broadcast the reset status
    broadcastSSE({
      type: 'processing-status',
      data: processingStatus,
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