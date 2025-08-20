import type { Express, Response as ExpressResponse } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import passport, { requireAuth } from "./auth";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { insertClipSchema, insertUserSchema, createSessionSchema, startSessionSchema, type ProcessingStatus, type SSEEvent, type SessionStatus } from "@shared/schema";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import { v4 as uuidv4 } from 'uuid';

// Session-based state management
const sessionProcesses = new Map<string, ChildProcess>();
const sessionSSEClients = new Map<string, Set<ExpressResponse>>();
const sessionStartTimes = new Map<string, Date>();

// Configuration limits
const MAX_CONCURRENT_SESSIONS = 3;
const SESSION_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const SESSION_MAX_IDLE_HOURS = 2;

function broadcastSessionSSE(sessionId: string, event: SSEEvent) {
  const clients = sessionSSEClients.get(sessionId);
  if (!clients) return;

  const data = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach(client => {
    try {
      client.write(data);
    } catch (error) {
      clients.delete(client);
    }
  });
}

function startSessionProcessor(sessionId: string, config: any): boolean {
  try {
    // Stop any existing processor for this session
    stopSessionProcessor(sessionId);

    const pythonPath = 'python3';
    const scriptPath = path.join(process.cwd(), 'backend', 'stream_processor.py');
    const configWithSession = { ...config, sessionId };
    const configJson = JSON.stringify(configWithSession);

    console.log(`Starting processor for session ${sessionId}: ${configJson}`);

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
      console.log(`Session ${sessionId} processor exited with code: ${code}`);
      sessionProcesses.delete(sessionId);
      storage.updateSessionStatus(sessionId, { 
        status: 'stopped', 
        isProcessing: false,
        processId: undefined 
      });
      broadcastSessionSSE(sessionId, {
        type: 'session-stopped',
        data: { sessionId, message: 'Stream processor stopped', code },
      });
    });

    processor.on('error', (error) => {
      console.error(`Session ${sessionId} processor error: ${error}`);
      sessionProcesses.delete(sessionId);
      storage.updateSessionStatus(sessionId, { 
        status: 'stopped', 
        isProcessing: false,
        lastError: error.message 
      });
    });

    sessionProcesses.set(sessionId, processor);
    return true;
  } catch (error) {
    console.error(`Failed to start processor for session ${sessionId}: ${error}`);
    return false;
  }
}

function stopSessionProcessor(sessionId: string) {
  const processor = sessionProcesses.get(sessionId);
  if (processor) {
    console.log(`Stopping processor for session ${sessionId}...`);
    processor.kill('SIGTERM');
    sessionProcesses.delete(sessionId);
  }
}

function ensureSessionDirectory(sessionId: string) {
  const sessionDir = path.join(process.cwd(), 'clips', sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const thumbnailsDir = path.join(sessionDir, 'thumbnails');
  if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
  }

  return sessionDir;
}

async function cleanupExpiredSessions() {
  try {
    const expiredSessions = await storage.cleanupExpiredSessions(SESSION_MAX_IDLE_HOURS);

    for (const sessionId of expiredSessions) {
      // Stop any running processes
      stopSessionProcessor(sessionId);

      // Clean up SSE clients
      sessionSSEClients.delete(sessionId);
      sessionStartTimes.delete(sessionId);

      // Optionally clean up session files
      const sessionDir = path.join(process.cwd(), 'clips', sessionId);
      if (fs.existsSync(sessionDir)) {
        console.log(`Cleaning up expired session directory: ${sessionId}`);
        // Uncomment to delete files: fs.rmSync(sessionDir, { recursive: true, force: true });
      }

      console.log(`Cleaned up expired session: ${sessionId}`);
    }
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Ensure clips directory exists
  const clipsDir = path.join(process.cwd(), 'clips');
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true });
  }

  // Start cleanup interval
  setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL);

  // Session Management Routes
  app.post('/api/sessions', async (req, res) => {
    try {
      const currentSessions = await storage.getAllSessions();
      const runningSessions = currentSessions.filter(s => s.status === 'running').length;

      if (runningSessions >= MAX_CONCURRENT_SESSIONS) {
        return res.status(429).json({ 
          error: 'Maximum concurrent sessions reached',
          maxSessions: MAX_CONCURRENT_SESSIONS,
          currentSessions: runningSessions
        });
      }

      const { sessionId } = await storage.createSession();
      ensureSessionDirectory(sessionId);

      res.json({ sessionId });
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  app.get('/api/sessions/:sessionId/status', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const status = await storage.getSessionStatus(sessionId);

      if (!status) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(status);
    } catch (error) {
      console.error('Error getting session status:', error);
      res.status(500).json({ error: 'Failed to get session status' });
    }
  });

  app.post('/api/sessions/:sessionId/start', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const validatedData = startSessionSchema.parse(req.body);

      const session = await storage.getSessionStatus(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.status === 'running') {
        return res.status(400).json({ error: 'Session already running' });
      }

      // Update session status
      await storage.updateSessionStatus(sessionId, {
        status: 'starting',
        streamUrl: validatedData.streamUrl,
        isProcessing: true,
        framesProcessed: 0,
        clipsGenerated: 0,
      });

      // Start processor
      const processorConfig = {
        url: validatedData.streamUrl,
        audioThreshold: validatedData.audioThreshold,
        motionThreshold: validatedData.motionThreshold,
        clipLength: validatedData.clipLength,
        sessionId,
        outputDir: path.join('clips', sessionId),
      };

      const started = startSessionProcessor(sessionId, processorConfig);

      if (started) {
        sessionStartTimes.set(sessionId, new Date());

        await storage.updateSessionStatus(sessionId, {
          status: 'running',
          processId: sessionProcesses.get(sessionId)?.pid,
        });

        broadcastSessionSSE(sessionId, {
          type: 'session-started',
          data: { sessionId, streamUrl: validatedData.streamUrl },
        });

        res.json({ success: true, sessionId });
      } else {
        await storage.updateSessionStatus(sessionId, {
          status: 'stopped',
          isProcessing: false,
          lastError: 'Failed to start stream processor',
        });
        res.status(500).json({ error: 'Failed to start stream processor' });
      }
    } catch (error) {
      console.error('Error starting session:', error);
      res.status(400).json({ error: 'Invalid request data' });
    }
  });

  app.post('/api/sessions/:sessionId/stop', async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = await storage.getSessionStatus(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      stopSessionProcessor(sessionId);
      sessionStartTimes.delete(sessionId);

      await storage.updateSessionStatus(sessionId, {
        status: 'stopped',
        isProcessing: false,
        processId: undefined,
      });

      broadcastSessionSSE(sessionId, {
        type: 'session-stopped',
        data: { sessionId },
      });

      res.json({ success: true, sessionId });
    } catch (error) {
      console.error('Error stopping session:', error);
      res.status(500).json({ error: 'Failed to stop session' });
    }
  });

  app.delete('/api/sessions/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      // Stop processor if running
      stopSessionProcessor(sessionId);
      sessionStartTimes.delete(sessionId);
      sessionSSEClients.delete(sessionId);

      // Delete session from storage
      const deleted = await storage.deleteSession(sessionId);

      if (deleted) {
        // Optionally delete session files
        const deleteFiles = req.query.deleteFiles === 'true';
        if (deleteFiles) {
          const sessionDir = path.join(process.cwd(), 'clips', sessionId);
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          }
        }

        res.json({ success: true, sessionId, filesDeleted: deleteFiles });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  app.get('/api/sessions/:sessionId/clips', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const clips = await storage.getClips(sessionId);
      res.json(clips);
    } catch (error) {
      console.error('Error fetching session clips:', error);
      res.status(500).json({ error: 'Failed to fetch clips' });
    }
  });

  // Session-scoped SSE
  app.get('/api/sessions/:sessionId/events', (req, res) => {
    const { sessionId } = req.params;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    if (!sessionSSEClients.has(sessionId)) {
      sessionSSEClients.set(sessionId, new Set());
    }
    sessionSSEClients.get(sessionId)!.add(res);

    // Send initial status
    storage.getSessionStatus(sessionId).then(status => {
      if (status) {
        res.write(`data: ${JSON.stringify({
          type: 'processing-status',
          data: status,
        })}\n\n`);
      }
    });

    req.on('close', () => {
      const clients = sessionSSEClients.get(sessionId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          sessionSSEClients.delete(sessionId);
        }
      }
    });
  });

  // Legacy routes (maintain compatibility)
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write(`data: ${JSON.stringify({
      type: 'processing-status',
      data: { isProcessing: false, message: 'Use session-based endpoints' },
    })}\n\n`);

    req.on('close', () => {});
  });

  app.get("/api/status", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (sessionId) {
      const status = await storage.getSessionStatus(sessionId);
      return res.json(status || { isProcessing: false });
    }
    res.json({ isProcessing: false, message: 'Use session-based endpoints' });
  });

  // Authentication routes (unchanged)
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { name, email, password } = req.body;
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists with this email' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ name, email, password: hashedPassword });
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

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
    app.get('/api/auth/google/callback', 
      passport.authenticate('google', { failureRedirect: '/signin' }),
      (req, res) => { res.redirect('/capture'); }
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

  // Clip routes (backwards compatible)
  app.get("/api/clips", async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      const clips = await storage.getClips(sessionId);
      res.json(clips || []);
    } catch (error) {
      console.error('Error fetching clips:', error);
      res.json([]);
    }
  });

  app.get('/api/clips/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const clip = await storage.getClip(id);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }
    res.json(clip);
  });

  app.delete('/api/clips/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const clip = await storage.getClip(id);
      if (!clip) {
        return res.status(404).json({ error: 'Clip not found' });
      }

      // Try session-scoped path first, then fallback to legacy
      let filePath = path.join(clipsDir, 'session', clip.filename);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(clipsDir, clip.filename);
      }

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await storage.deleteClip(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete clip' });
    }
  });

  app.get("/clips/:sessionId/:filename", (req, res) => {
    const { sessionId, filename } = req.params;
    const filePath = path.join(process.cwd(), "clips", sessionId, filename);

    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      // Fallback to legacy path
      const legacyPath = path.join(process.cwd(), "clips", filename);
      if (fs.existsSync(legacyPath)) {
        res.sendFile(legacyPath);
      } else {
        res.status(404).json({ error: "File not found" });
      }
    }
  });

  // Legacy clip serving (backwards compatibility)
  app.get("/clips/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(process.cwd(), "clips", filename);

    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  });

  // Internal API routes (updated for session support)
  app.post('/api/clips', async (req, res) => {
    try {
      const clipData = { ...req.body };

      // Extract session ID from filename if present
      const sessionMatch = clipData.filename?.match(/session_([^_]+)_/);
      if (sessionMatch) {
        clipData.sessionId = sessionMatch[1];
      }

      const validatedData = insertClipSchema.parse(clipData);
      const clip = await storage.createClip(validatedData);

      // Broadcast to specific session if available
      if (clipData.sessionId) {
        broadcastSessionSSE(clipData.sessionId, {
          type: 'clip-generated',
          data: clip,
        });

        // Update session clip count
        const session = await storage.getSessionStatus(clipData.sessionId);
        if (session) {
          await storage.updateSessionStatus(clipData.sessionId, {
            clipsGenerated: (session.clipsGenerated || 0) + 1,
          });
        }
      }

      res.json(clip);
    } catch (error) {
      console.error('Error creating clip:', error);
      res.status(400).json({ error: 'Invalid clip data' });
    }
  });

  app.post('/api/internal/metrics', async (req, res) => {
    try {
      const metricsData = req.body;
      const sessionId = metricsData.sessionId;

      if (sessionId) {
        // Update session-specific metrics
        const startTime = sessionStartTimes.get(sessionId);
        if (startTime && metricsData.isProcessing) {
          const uptime = Date.now() - startTime.getTime();
          const hours = Math.floor(uptime / (1000 * 60 * 60));
          const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
          metricsData.streamUptime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        await storage.updateSessionStatus(sessionId, metricsData);

        broadcastSessionSSE(sessionId, {
          type: 'processing-status',
          data: metricsData,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating metrics:', error);
      res.status(500).json({ error: 'Failed to update metrics' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}