import type { Express, Response as ExpressResponse } from "express";
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
const sseClients = new Set<ExpressResponse>();

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

  // SSE endpoint
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
  app.get("/api/status", (req, res) => {
    res.json(processingStatus);
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
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: 'No active session' });
      }

      const updatedSession = await storage.updateSessionStatus(activeSession.id, false);

      // Stop Python stream processor
      stopStreamProcessor();

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
  app.get("/api/download-all", async (req, res) => {
    try {
      const clips = await storage.getClips();

      if (clips.length === 0) {
        return res.status(404).json({ error: "No clips found" });
      }

      const archive = archiver('zip', { zlib: { level: 9 } });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      res.attachment(`clips-${timestamp}.zip`);
      archive.pipe(res);

      let filesAdded = 0;
      for (const clip of clips) {
        const filePath = path.join(process.cwd(), 'clips', clip.filename);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: clip.filename });
          filesAdded++;
        }
      }

      if (filesAdded === 0) {
        return res.status(404).json({ error: "No clip files found on disk" });
      }

      await archive.finalize();
    } catch (error) {
      console.error('Download all error:', error);
      res.status(500).json({ error: "Failed to create archive" });
    }
  });

  // Stream embed endpoint - provides embedded video player
  app.get("/api/stream-embed", async (req, res) => {
    try {
      let streamUrl = req.query.url as string;

      if (!streamUrl) {
        return res.status(400).send("Stream URL required");
      }

      // Try to get the resolved stream URL from the processor status
      let resolvedUrl = streamUrl;
      try {
        // Check if we have a resolved URL in processingStatus
        if (processingStatus.resolvedStreamUrl) {
          resolvedUrl = processingStatus.resolvedStreamUrl;
          console.log('Using resolved stream URL for embed:', resolvedUrl.substring(0, 80) + '...');
        } else {
          console.log('No resolved URL available, using original:', streamUrl);
        }
      } catch (e) {
        console.log('Could not get resolved URL, using original URL');
      }

      // Generate HTML for embedded stream player with better error handling
      const embedHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Live Stream</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #0f172a;
            font-family: system-ui, -apple-system, sans-serif;
            overflow: hidden;
        }

        #video-container {
            width: 100vw;
            height: 100vh;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        video {
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: #000;
        }

        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #64748b;
            font-size: 14px;
            text-align: center;
        }

        .error {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #ef4444;
            font-size: 14px;
            text-align: center;
        }

        .spinner {
            border: 2px solid #64748b;
            border-top: 2px solid #3b82f6;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div id="video-container">
        <div class="loading" id="loading">
            <div class="spinner"></div>
            Loading stream...
        </div>
        <video id="stream-video" controls autoplay muted playsinline style="display: none;">
            <source src="${resolvedUrl}" type="application/x-mpegURL">
            <source src="${resolvedUrl}" type="video/mp4">
            Your browser does not support the video tag.
        </video>
        <div class="error" id="error" style="display: none;">
            Failed to load stream<br>
            <small>Stream may be offline or URL invalid</small><br>
            <button onclick="retryStream()" style="margin-top: 10px; padding: 5px 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry</button>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        const video = document.getElementById('stream-video');
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        const streamUrl = '${resolvedUrl}';
        let hls = null;

        function showError() {
            loading.style.display = 'none';
            video.style.display = 'none';
            error.style.display = 'block';
            console.log('Stream failed to load:', streamUrl.substring(0, 80));
        }

        function showVideo() {
            loading.style.display = 'none';
            error.style.display = 'none';
            video.style.display = 'block';
        }

        function retryStream() {
            error.style.display = 'none';
            loading.style.display = 'block';
            initializeStream();
        }

        function initializeStream() {
            console.log('Initializing stream:', streamUrl.substring(0, 80));
            
            // Clean up existing HLS instance
            if (hls) {
                hls.destroy();
                hls = null;
            }

            // Check if it's an HLS stream
            if (streamUrl.includes('.m3u8') || streamUrl.includes('playlist')) {
                if (Hls.isSupported()) {
                    console.log('Using HLS.js for stream playback');
                    hls = new Hls({
                        enableWorker: false,
                        lowLatencyMode: true,
                        backBufferLength: 30,
                        maxLoadingDelay: 4,
                        startFragPrefetch: true,
                        fragLoadingTimeOut: 20000,
                        manifestLoadingTimeOut: 10000
                    });

                    hls.loadSource(streamUrl);
                    hls.attachMedia(video);

                    hls.on(Hls.Events.MANIFEST_PARSED, function() {
                        console.log('HLS manifest parsed successfully');
                        showVideo();
                        video.play().catch(e => {
                            console.log('Autoplay prevented:', e);
                            showVideo(); // Still show controls even if autoplay fails
                        });
                    });

                    hls.on(Hls.Events.ERROR, function (event, data) {
                        console.error('HLS Error:', data.type, data.details);
                        if (data.fatal) {
                            console.error('Fatal HLS error, showing error message');
                            showError();
                        } else {
                            console.warn('Non-fatal HLS error, attempting to recover');
                            // Try to recover from non-fatal errors
                            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                                hls.startLoad();
                            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                                hls.recoverMediaError();
                            }
                        }
                    });

                    hls.on(Hls.Events.FRAG_LOADED, function() {
                        console.log('Fragment loaded successfully');
                    });

                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    console.log('Using native HLS support');
                    video.src = streamUrl;
                    video.addEventListener('loadeddata', showVideo);
                    video.addEventListener('error', showError);
                    video.load();
                } else {
                    console.error('HLS not supported in this browser');
                    showError();
                }
            } else {
                console.log('Using native video element for non-HLS stream');
                video.src = streamUrl;
                video.addEventListener('loadeddata', showVideo);
                video.addEventListener('error', showError);
                video.load();
            }
        }

        // Initialize stream on page load
        initializeStream();

        // Handle video events
        video.addEventListener('waiting', () => {
            console.log('Video buffering...');
        });

        video.addEventListener('playing', () => {
            console.log('Video playing successfully');
        });

        video.addEventListener('loadstart', () => {
            console.log('Video load started');
        });

        video.addEventListener('canplay', () => {
            console.log('Video can start playing');
        });
    </script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.send(embedHtml);

    } catch (error) {
      console.error('Stream embed error:', error);
      res.status(500).send("Failed to generate stream embed");
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
      
      // Store resolved stream URL if provided
      if (metricsData.resolvedStreamUrl) {
        processingStatus.resolvedStreamUrl = metricsData.resolvedStreamUrl;
      }

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

  // Internal stream ended notification endpoint
  app.post('/api/internal/stream-ended', (req, res) => {
    const { url, endTime, totalClips, totalDuration, lastSuccessfulCapture } = req.body;

    console.log(`Stream ended notification: ${url} after ${totalDuration}s with ${totalClips} clips`);

    // Update processing status
    processingStatus.isProcessing = false;

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

    res.json({ success: true });
  });

  const httpServer = createServer(app);
  return httpServer;
}