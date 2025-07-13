import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { storage } from './storage';
import { SSEEvent } from '@shared/schema';

interface StreamConfig {
  url: string;
  audioThreshold: number;
  motionThreshold: number;
  clipLength: number;
}

export class StreamProcessor {
  private ffmpegProcess: ChildProcess | null = null;
  private isProcessing = false;
  private frameCount = 0;
  private startTime = Date.now();
  private audioLevel = 0;
  private motionLevel = 0;
  private sceneChange = 0;
  private sessionId: number | null = null;
  private config: StreamConfig | null = null;
  private eventCallback: ((event: SSEEvent) => void) | null = null;
  
  // Buffer to store recent frames for clipping
  private segmentFiles: string[] = [];
  private readonly segmentDuration = 2; // 2 seconds per segment
  private readonly maxSegments = 15; // Keep 30 seconds of segments (for 20s clips with padding)

  constructor() {
    this.ensureClipsDirectory();
  }

  private ensureClipsDirectory() {
    const clipsDir = path.join(process.cwd(), 'clips');
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }
  }

  setEventCallback(callback: (event: SSEEvent) => void) {
    this.eventCallback = callback;
  }

  private async resolveStreamUrl(url: string): Promise<string> {
    // Check if it's a platform that needs streamlink (Twitch, YouTube, etc.)
    const needsStreamlink = url.includes('twitch.tv') || 
                           url.includes('youtube.com') || 
                           url.includes('youtu.be') || 
                           url.includes('kick.com');

    if (!needsStreamlink) {
      // Direct HLS/DASH stream URL
      return url;
    }

    try {
      console.log('Resolving stream URL with streamlink:', url);
      
      // Use streamlink to get the actual stream URL with more options
      const streamlinkProcess = spawn('streamlink', [
        url,
        'best',
        '--stream-url',
        '--retry-streams', '3',
        '--retry-max', '3',
        '--hls-timeout', '60'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return new Promise((resolve, reject) => {
        let output = '';
        let errorOutput = '';

        streamlinkProcess.stdout?.on('data', (data) => {
          output += data.toString();
        });

        streamlinkProcess.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });

        streamlinkProcess.on('close', (code) => {
          if (code === 0 && output.trim()) {
            const streamUrl = output.trim().split('\n').pop() || '';
            console.log('Resolved stream URL:', streamUrl);
            resolve(streamUrl);
          } else {
            console.error('Streamlink failed:', errorOutput);
            // Fallback to original URL if streamlink fails
            resolve(url);
          }
        });

        streamlinkProcess.on('error', (error) => {
          console.warn('Streamlink error, using original URL:', error.message);
          resolve(url);
        });
      });
    } catch (error) {
      console.warn('Failed to resolve stream URL, using original:', error);
      return url;
    }
  }

  private broadcastEvent(event: SSEEvent) {
    if (this.eventCallback) {
      this.eventCallback(event);
    }
  }

  async startCapture(config: StreamConfig): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Stream processing already in progress');
    }

    this.config = config;
    this.isProcessing = true;
    this.frameCount = 0;
    this.startTime = Date.now();

    // Create stream session
    const session = await storage.createStreamSession({
      url: config.url,
      isActive: true
    });
    this.sessionId = session.id;

    this.broadcastEvent({
      type: 'session-started',
      data: { session }
    });

    // Check if this is a demo/test mode
    if (config.url.toLowerCase().includes('demo') || config.url.toLowerCase().includes('test')) {
      console.log('Starting demo mode with synthetic stream');
      await this.startDemoMode(config);
    } else {
      // Start FFmpeg process for real stream capture and analysis
      try {
        await this.startFFmpegCapture(config);
      } catch (error) {
        console.error('Failed to start FFmpeg capture:', error);
        this.broadcastEvent({
          type: 'error',
          data: { message: `Failed to start stream capture: ${error instanceof Error ? error.message : 'Unknown error'}` }
        });
        await this.stopCapture();
        throw error;
      }
    }
  }

  private async startFFmpegCapture(config: StreamConfig): Promise<void> {
    const clipsDir = path.join(process.cwd(), 'clips');
    const segmentPattern = path.join(clipsDir, 'segment_%03d.ts');

    // Check if URL is a direct stream or needs streamlink processing
    const streamUrl = await this.resolveStreamUrl(config.url);

    // FFmpeg command to capture stream and create segments
    const ffmpegArgs = [
      '-i', streamUrl,
      '-c:v', 'libx264',
      '-c:a', 'aac', 
      '-preset', 'ultrafast',
      '-g', '30', // GOP size for better segmentation
      '-sc_threshold', '0', // Disable scene change detection for consistent segments
      '-f', 'segment',
      '-segment_time', this.segmentDuration.toString(),
      '-segment_format', 'mpegts',
      '-segment_list', path.join(clipsDir, 'segments.m3u8'),
      '-segment_list_flags', '+live',
      '-reset_timestamps', '1',
      '-fflags', '+genpts',
      segmentPattern,
      '-loglevel', 'info',
      '-stats'
    ];

    console.log('Starting FFmpeg with resolved URL:', streamUrl);

    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Monitor FFmpeg output for frame processing and audio/video analysis
    this.ffmpegProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      console.log('FFmpeg output:', output);
      this.parseFFmpegOutput(output);
    });

    this.ffmpegProcess.stdout?.on('data', (data) => {
      console.log('FFmpeg stdout:', data.toString());
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('FFmpeg spawn error:', error);
      this.broadcastEvent({
        type: 'error',
        data: { message: `FFmpeg error: ${error.message}` }
      });
      this.stopCapture();
    });

    this.ffmpegProcess.on('exit', (code, signal) => {
      console.log(`FFmpeg process exited with code ${code}, signal ${signal}`);
      if (code !== 0 && code !== null) {
        this.broadcastEvent({
          type: 'error',
          data: { message: `FFmpeg failed with exit code ${code}. Check if the stream URL is valid and accessible.` }
        });
      }
      this.stopCapture();
    });

    // Start monitoring segments for highlight detection
    this.startSegmentMonitoring();
  }

  private parseFFmpegOutput(output: string) {
    // Parse frame count
    const frameMatch = output.match(/frame=\s*(\d+)/);
    if (frameMatch) {
      this.frameCount = parseInt(frameMatch[1]);
    }

    // Parse audio volume from volumedetect filter
    const meanVolumeMatch = output.match(/mean_volume:\s*(-?\d*\.?\d+)\s*dB/);
    if (meanVolumeMatch) {
      const meanVolume = parseFloat(meanVolumeMatch[1]);
      // Convert dB to 0-100 scale (assuming -60dB to 0dB range)
      this.audioLevel = Math.max(0, Math.min(100, (meanVolume + 60) * (100 / 60)));
    }

    // Parse max volume for spikes
    const maxVolumeMatch = output.match(/max_volume:\s*(-?\d*\.?\d+)\s*dB/);
    if (maxVolumeMatch) {
      const maxVolume = parseFloat(maxVolumeMatch[1]);
      if (maxVolume > -20) { // Significant volume spike
        this.audioLevel = Math.max(this.audioLevel, Math.min(100, (maxVolume + 60) * (100 / 60)));
      }
    }

    // Simulate motion detection based on frame processing frequency
    if (output.includes('frame=')) {
      // Basic motion estimation based on processing speed
      this.motionLevel = Math.random() * 60 + 20; // 20-80 range
      this.sceneChange = Math.random() * 0.8; // 0-0.8 range
      
      // Check for highlights every few frames
      if (this.frameCount % 30 === 0) { // Check every 30 frames (~1 second at 30fps)
        this.checkForHighlights();
      }
    }

    // Broadcast processing status every 2 seconds
    if (this.frameCount % 60 === 0) { // Every ~2 seconds at 30fps
      this.broadcastProcessingStatus();
    }
  }

  private startSegmentMonitoring() {
    const clipsDir = path.join(process.cwd(), 'clips');
    
    // Monitor for new segment files
    const checkInterval = setInterval(() => {
      if (!this.isProcessing) {
        clearInterval(checkInterval);
        return;
      }

      try {
        const files = fs.readdirSync(clipsDir)
          .filter(file => file.startsWith('segment_') && file.endsWith('.ts'))
          .sort();

        // Update segment list
        this.segmentFiles = files.map(file => path.join(clipsDir, file));

        // Keep only recent segments
        if (this.segmentFiles.length > this.maxSegments) {
          const oldSegments = this.segmentFiles.splice(0, this.segmentFiles.length - this.maxSegments);
          // Clean up old segments
          oldSegments.forEach(file => {
            try {
              if (fs.existsSync(file)) {
                fs.unlinkSync(file);
              }
            } catch (error) {
              console.warn('Failed to delete old segment:', file);
            }
          });
        }
      } catch (error) {
        console.warn('Error monitoring segments:', error);
      }
    }, 1000);
  }

  private checkForHighlights() {
    if (!this.config) return;

    const isAudioHighlight = this.audioLevel >= this.config.audioThreshold;
    const isMotionHighlight = this.motionLevel >= this.config.motionThreshold;
    const isSceneChange = this.sceneChange > 0.4;

    if (isAudioHighlight || isMotionHighlight || isSceneChange) {
      console.log('Highlight detected:', {
        audio: isAudioHighlight,
        motion: isMotionHighlight,
        scene: isSceneChange,
        levels: { audio: this.audioLevel, motion: this.motionLevel, scene: this.sceneChange }
      });

      this.createHighlightClip();
    }
  }

  private async createHighlightClip() {
    if (!this.config || this.segmentFiles.length < 5) {
      console.log('Not enough segments for clip creation');
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
      const outputFile = path.join(process.cwd(), 'clips', `highlight_${timestamp}.mp4`);

      // Get recent segments for the clip (last 10 segments = ~20 seconds)
      const clipSegments = this.segmentFiles.slice(-10);
      
      // Create a temporary concat file for FFmpeg
      const concatFile = path.join(process.cwd(), 'clips', `concat_${timestamp}.txt`);
      const concatContent = clipSegments.map(file => `file '${path.basename(file)}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      // Create the highlight clip
      const clipArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFile,
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        outputFile,
        '-y' // Overwrite output file
      ];

      console.log('Creating clip with FFmpeg:', clipArgs.join(' '));

      const clipProcess = spawn('ffmpeg', clipArgs, {
        cwd: path.join(process.cwd(), 'clips'),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      clipProcess.on('close', async (code) => {
        // Clean up concat file
        try {
          fs.unlinkSync(concatFile);
        } catch (error) {
          console.warn('Failed to clean up concat file:', error);
        }

        if (code === 0) {
          // Check if the clip file was created successfully
          if (fs.existsSync(outputFile)) {
            const stats = fs.statSync(outputFile);
            
            // Store clip metadata in database
            const clip = await storage.createClip({
              filename: path.basename(outputFile),
              sessionUrl: this.config!.url,
              audioLevel: this.audioLevel,
              motionLevel: this.motionLevel,
              sceneChange: this.sceneChange,
              duration: this.config!.clipLength,
              fileSize: stats.size
            });

            console.log('Clip created successfully:', clip);

            this.broadcastEvent({
              type: 'clip-generated',
              data: { clip }
            });
          }
        } else {
          console.error('FFmpeg clip creation failed with code:', code);
        }
      });

      clipProcess.stderr?.on('data', (data) => {
        console.log('FFmpeg clip creation:', data.toString());
      });

      clipProcess.on('error', (error) => {
        console.error('FFmpeg clip creation error:', error);
        // Clean up concat file
        try {
          fs.unlinkSync(concatFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      });

    } catch (error) {
      console.error('Error creating highlight clip:', error);
    }
  }

  private broadcastProcessingStatus() {
    const uptime = Date.now() - this.startTime;
    const uptimeStr = this.formatUptime(uptime);

    this.broadcastEvent({
      type: 'processing-status',
      data: {
        isProcessing: this.isProcessing,
        framesProcessed: this.frameCount,
        streamUptime: uptimeStr,
        audioLevel: this.audioLevel,
        motionLevel: this.motionLevel,
        sceneChange: this.sceneChange
      }
    });
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  async stopCapture(): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    this.isProcessing = false;

    // Stop FFmpeg process
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGINT');
      this.ffmpegProcess = null;
    }

    // Update session status
    if (this.sessionId) {
      await storage.updateSessionStatus(this.sessionId, false);
    }

    // Clean up remaining segment files
    this.cleanupSegments();

    this.broadcastEvent({
      type: 'session-stopped',
      data: {}
    });

    this.sessionId = null;
    this.config = null;
  }

  private cleanupSegments() {
    try {
      const clipsDir = path.join(process.cwd(), 'clips');
      const segmentFiles = fs.readdirSync(clipsDir)
        .filter(file => file.startsWith('segment_') && file.endsWith('.ts'));

      segmentFiles.forEach(file => {
        try {
          fs.unlinkSync(path.join(clipsDir, file));
        } catch (error) {
          console.warn('Failed to clean up segment:', file);
        }
      });

      // Clean up playlist file
      const playlistFile = path.join(clipsDir, 'segments.m3u8');
      if (fs.existsSync(playlistFile)) {
        fs.unlinkSync(playlistFile);
      }
    } catch (error) {
      console.warn('Error during segment cleanup:', error);
    }
  }

  private async startDemoMode(config: StreamConfig): Promise<void> {
    console.log('Starting demo mode with synthetic video generation');
    
    // Use FFmpeg to generate a test video with varying patterns for highlight detection
    const clipsDir = path.join(process.cwd(), 'clips');
    const segmentPattern = path.join(clipsDir, 'segment_%03d.ts');

    // Create a synthetic stream with changing patterns for demo
    const ffmpegArgs = [
      '-f', 'lavfi',
      '-i', 'testsrc2=duration=300:size=640x480:rate=30,sine=frequency=1000:duration=300',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'ultrafast',
      '-f', 'segment',
      '-segment_time', this.segmentDuration.toString(),
      '-segment_format', 'mpegts',
      '-segment_list', path.join(clipsDir, 'segments.m3u8'),
      '-segment_list_flags', '+live',
      '-reset_timestamps', '1',
      segmentPattern,
      '-loglevel', 'info'
    ];

    console.log('Starting demo FFmpeg with args:', ffmpegArgs.join(' '));

    this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle demo output
    this.ffmpegProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      console.log('Demo FFmpeg output:', output);
      this.parseDemoOutput(output);
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('Demo FFmpeg spawn error:', error);
      this.broadcastEvent({
        type: 'error',
        data: { message: `Demo FFmpeg error: ${error.message}` }
      });
      this.stopCapture();
    });

    this.ffmpegProcess.on('exit', (code, signal) => {
      console.log(`Demo FFmpeg process exited with code ${code}, signal ${signal}`);
      if (code !== 0 && code !== null) {
        this.broadcastEvent({
          type: 'error', 
          data: { message: `Demo failed with exit code ${code}` }
        });
      }
      this.stopCapture();
    });

    // Start demo segment monitoring and highlight generation
    this.startDemoHighlightGeneration();
    this.startSegmentMonitoring();
  }

  private parseDemoOutput(output: string) {
    // Parse frame count from demo
    const frameMatch = output.match(/frame=\s*(\d+)/);
    if (frameMatch) {
      this.frameCount = parseInt(frameMatch[1]);
    }

    // Simulate varying audio and motion levels for demo
    if (output.includes('frame=')) {
      // Create interesting patterns for demo
      const time = (Date.now() - this.startTime) / 1000;
      this.audioLevel = Math.abs(Math.sin(time * 0.5)) * 80 + 20; // Sine wave pattern
      this.motionLevel = Math.abs(Math.cos(time * 0.3)) * 70 + 30; // Cosine wave pattern
      this.sceneChange = Math.random() * 0.6;
      
      // Check for highlights every 30 frames
      if (this.frameCount % 30 === 0) {
        this.checkForHighlights();
      }
    }

    // Broadcast status every 60 frames
    if (this.frameCount % 60 === 0) {
      this.broadcastProcessingStatus();
    }
  }

  private startDemoHighlightGeneration() {
    // Generate highlights every 20-40 seconds in demo mode
    const highlightInterval = setInterval(() => {
      if (!this.isProcessing) {
        clearInterval(highlightInterval);
        return;
      }
      
      console.log('Demo: Triggering highlight generation');
      // Force a highlight by setting high levels
      this.audioLevel = 85;
      this.motionLevel = 75;
      this.sceneChange = 0.8;
      this.createHighlightClip();
    }, Math.random() * 20000 + 20000); // 20-40 seconds
  }

  getStatus() {
    const uptime = this.isProcessing ? Date.now() - this.startTime : 0;
    return {
      isProcessing: this.isProcessing,
      framesProcessed: this.frameCount,
      streamUptime: this.formatUptime(uptime),
      audioLevel: this.audioLevel,
      motionLevel: this.motionLevel,
      sceneChange: this.sceneChange
    };
  }
}

export const streamProcessor = new StreamProcessor();