import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertStreamSessionSchema, insertClipSchema, type ProcessingStatus, type SSEEvent } from "@shared/schema";
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
const sseClients = new Set<Response>();

// Python stream processor
let streamProcessor: ChildProcess | null = null;
let sessionStartTime: Date | null = null;

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
    // Stop any existing processor
    stopStreamProcessor();

    const pythonPath = 'python3';
    const scriptPath = path.join(process.cwd(), 'backend', 'stream_processor.py');
    const configJson = JSON.stringify(config);

    console.log(`Starting stream processor with config: ${configJson}`);

    streamProcessor = spawn(pythonPath, [scriptPath, configJson], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    if (streamProcessor.stdout) {
      streamProcessor.stdout.on('data', (data) => {
        console.log(`[StreamProcessor]: ${data.toString().trim()}`);
      });
    }

    if (streamProcessor.stderr) {
      streamProcessor.stderr.on('data', (data) => {
        console.error(`[StreamProcessor Error]: ${data.toString().trim()}`);
      });
    }

    streamProcessor.on('exit', (code) => {
      console.log(`Stream processor exited with code: ${code}`);
      if (processingStatus.isProcessing) {
        processingStatus.isProcessing = false;
        broadcastSSE({
          type: 'session-stopped',
          data: { message: 'Stream processor stopped unexpectedly' },
        });
      }
    });

    streamProcessor.on('error', (error) => {
      console.error(`Stream processor error: ${error}`);
    });

    return true;
  } catch (error) {
    console.error(`Failed to start stream processor: ${error}`);
    return false;
  }
}

function stopStreamProcessor() {
  if (streamProcessor) {
    console.log('Stopping stream processor...');
    streamProcessor.kill('SIGTERM');
    streamProcessor = null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Ensure clips directory exists
  const clipsDir = path.join(process.cwd(), 'clips');
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true });
  }

  // Clean up any orphaned clip files on startup
  try {
    const existingFiles = fs.readdirSync(clipsDir).filter(file => file.endsWith('.mp4'));
    console.log(`Found ${existingFiles.length} existing clip files, cleaning up...`);
    
    // For development, remove old files to start fresh
    existingFiles.forEach(file => {
      const filePath = path.join(clipsDir, file);
      fs.unlinkSync(filePath);
    });
    
    console.log('✅ Clip directory cleaned');
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

  // Get processing status
  app.get('/api/status', async (req, res) => {
    const activeSession = await storage.getActiveSession();
    res.json({
      ...processingStatus,
      currentSession: activeSession,
    });
  });

  // Start stream capture
  app.post('/api/start', async (req, res) => {
    try {
      const validatedData = insertStreamSessionSchema.parse(req.body);

      // Stop any active sessions
      const activeSession = await storage.getActiveSession();
      if (activeSession) {
        await storage.updateSessionStatus(activeSession.id, false);
        stopStreamProcessor();
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
      };

      const started = startStreamProcessor(processorConfig);

      if (started) {
        // Update processing status
        processingStatus.isProcessing = true;
        processingStatus.framesProcessed = 0;
        processingStatus.currentSession = session;
        sessionStartTime = new Date();

        broadcastSSE({
          type: 'session-started',
          data: session,
        });

        res.json(session);
      } else {
        // Failed to start processor
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
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: 'No active session' });
      }

      const updatedSession = await storage.updateSessionStatus(activeSession.id, false);

      // Stop Python stream processor
      stopStreamProcessor();

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

  // Get all clips
  app.get('/api/clips', async (req, res) => {
    const clips = await storage.getClips();
    res.json(clips);
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
    const filename = req.params.filename;
    const videoPath = path.join(process.cwd(), "clips", filename);
    const thumbnailPath = path.join(process.cwd(), "clips", "thumbnails", `${filename}.jpg`);

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: "Video file not found" });
    }

    // Create thumbnails directory if it doesn't exist
    const thumbnailDir = path.join(process.cwd(), "clips", "thumbnails");
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }

    // Check if thumbnail already exists
    if (fs.existsSync(thumbnailPath)) {
      return res.sendFile(thumbnailPath);
    }

    try {
      // Generate thumbnail using FFmpeg
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec(
          `ffmpeg -i "${videoPath}" -ss 00:00:02 -vframes 1 -vf "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2" "${thumbnailPath}"`,
          (error: any, stdout: any, stderr: any) => {
            if (error) {
              console.error('Thumbnail generation error:', error);
              reject(error);
            } else {
              resolve(stdout);
            }
          }
        );
      });

      res.sendFile(thumbnailPath);
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      res.status(500).json({ error: "Failed to generate thumbnail" });
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

  const httpServer = createServer(app);
  return httpServer;
}