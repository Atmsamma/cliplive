import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertStreamSessionSchema, insertClipSchema, type ProcessingStatus, type SSEEvent } from "@shared/schema";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { streamProcessor } from "./stream-processor";

// Mock processing state
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

// Mock highlight detection interval
let highlightInterval: NodeJS.Timeout | null = null;
let metricsInterval: NodeJS.Timeout | null = null;
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

function generateMockClip(sessionUrl: string): Promise<void> {
  return new Promise(async (resolve) => {
    const triggerReasons = ['Audio Spike', 'Motion Detected', 'Scene Change'];
    const triggerReason = triggerReasons[Math.floor(Math.random() * triggerReasons.length)];
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `highlight_${timestamp}.txt`;
    
    // Mock file creation
    const clipsDir = path.join(process.cwd(), 'clips');
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }
    
    // Create a mock text file with clip information
    const filePath = path.join(clipsDir, filename);
    const mockContent = `STREAM CLIPPER - MOCK HIGHLIGHT CLIP
=====================================

Clip Details:
- Filename: ${filename}
- Trigger Reason: ${triggerReason}
- Original URL: ${sessionUrl}
- Duration: 20 seconds
- Generated: ${new Date().toISOString()}

This is a mock highlight clip generated for development purposes.
In a real implementation, this would be a 20-second video file
extracted from the live stream when a highlight was detected.

Processing Details:
- Audio threshold exceeded: ${triggerReason === 'Audio Spike' ? 'YES' : 'NO'}
- Motion detected: ${triggerReason === 'Motion Detected' ? 'YES' : 'NO'}
- Scene change detected: ${triggerReason === 'Scene Change' ? 'YES' : 'NO'}

To implement real video processing, you would need:
1. FFmpeg installed and accessible
2. Streamlink for stream capture
3. Python backend for video analysis
4. Real-time processing pipeline

This mock system demonstrates the UI and workflow
without requiring external video processing tools.
`;
    
    fs.writeFileSync(filePath, mockContent);
    const fileSize = mockContent.length;
    
    const clip = await storage.createClip({
      filename,
      originalUrl: sessionUrl,
      duration: 20,
      fileSize: fileSize,
      triggerReason,
    });
    
    broadcastSSE({
      type: 'clip-generated',
      data: clip,
    });
    
    resolve();
  });
}

function updateProcessingMetrics() {
  processingStatus.framesProcessed += Math.floor(Math.random() * 50) + 10;
  processingStatus.audioLevel = Math.floor(Math.random() * 100);
  processingStatus.motionLevel = Math.floor(Math.random() * 100);
  processingStatus.sceneChange = Math.random();
  
  if (sessionStartTime) {
    const uptime = Date.now() - sessionStartTime.getTime();
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
    processingStatus.streamUptime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  broadcastSSE({
    type: 'processing-status',
    data: processingStatus,
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Ensure clips directory exists
  const clipsDir = path.join(process.cwd(), 'clips');
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true });
  }

  // Set up the stream processor to broadcast events
  streamProcessor.setEventCallback(broadcastSSE);

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
    const currentStatus = streamProcessor.getStatus();
    res.write(`data: ${JSON.stringify({
      type: 'processing-status',
      data: currentStatus,
    })}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Get processing status
  app.get('/api/status', async (req, res) => {
    const activeSession = await storage.getActiveSession();
    const processorStatus = streamProcessor.getStatus();
    res.json({
      ...processorStatus,
      currentSession: activeSession,
    });
  });

  // Start stream capture
  app.post('/api/start', async (req, res) => {
    try {
      const streamConfigSchema = z.object({
        url: z.string().url(),
        audioThreshold: z.number().min(0).max(100).default(6),
        motionThreshold: z.number().min(0).max(100).default(30),
        clipLength: z.number().min(5).max(60).default(20),
      });
      
      const config = streamConfigSchema.parse(req.body);
      
      // Stop any current processing
      await streamProcessor.stopCapture();
      
      // Start FFmpeg processing
      await streamProcessor.startCapture(config);
      
      res.json({ message: 'Stream capture started', config });
    } catch (error) {
      console.error('Failed to start stream capture:', error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : 'Invalid request data' 
      });
    }
  });

  // Stop stream capture
  app.post('/api/stop', async (req, res) => {
    try {
      await streamProcessor.stopCapture();
      res.json({ message: 'Stream capture stopped' });
    } catch (error) {
      console.error('Failed to stop stream capture:', error);
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

  // Serve clip files
  app.get('/clips/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(clipsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(filePath);
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

  const httpServer = createServer(app);
  return httpServer;
}
