import { spawn, ChildProcess } from "child_process";
import { Response as ExpressResponse } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

export interface SessionState {
  id: string;
  streamUrl?: string;
  status: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  logs: string[];
  taskPid?: number;
  outDir: string;
  process?: ChildProcess;
  createdAt: Date;
  lastActivity: Date;
  sseClients: Set<ExpressResponse>;
  error?: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private readonly maxSessions = 3; // Limit for resource management
  private readonly sessionTTL = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Auto-cleanup every 30 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 30 * 60 * 1000);
  }

  createSession(): string {
    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Maximum ${this.maxSessions} sessions allowed. Please try again later.`);
    }

    const sessionId = uuidv4();
    const outDir = path.join(process.cwd(), 'clips', sessionId);
    console.log(`[TRACE] Created session: ${sessionId}, outDir: ${outDir}`);
    // Ensure output directory exists
    fs.mkdirSync(outDir, { recursive: true });

    const session: SessionState = {
      id: sessionId,
      status: 'idle',
      logs: [],
      outDir,
      createdAt: new Date(),
      lastActivity: new Date(),
      sseClients: new Set()
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  getSession(sessionId: string): SessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  async startStream(sessionId: string, streamUrl: string): Promise<void> {
  const session = this.getSession(sessionId);
  console.log(`[TRACE] startStream: sessionId=${sessionId}, outDir=${session?.outDir}`);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status === 'running') {
      throw new Error('Stream already running for this session');
    }

    try {
      session.status = 'starting';
      session.streamUrl = streamUrl;
      session.logs.push(`Starting stream capture for ${streamUrl}`);
      this.broadcastToSession(sessionId, { type: 'status', data: { status: session.status } });

      // Start the stream processing subprocess
      // Prefer project venv python if present for consistent deps
      const venvPython = process.platform === 'win32'
        ? path.join(process.cwd(), '.venv', 'Scripts', 'python.exe')
        : path.join(process.cwd(), '.venv', 'bin', 'python');
      const pythonExe = fs.existsSync(venvPython) ? venvPython : (process.platform === 'win32' ? 'python' : 'python3');

      const scriptPath = path.join(process.cwd(), 'gatekeep_and_clip.py');
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`gatekeep_and_clip.py not found at ${scriptPath}`);
      }

      const args = [
        scriptPath,
        '--url', streamUrl,
        '--output-dir', session.outDir,
        '--session-id', sessionId
      ];

      const streamProcess = spawn(pythonExe, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }
      });

      streamProcess.once('error', (err) => {
        session.logs.push(`Spawn error: ${err.message}`);
        session.status = 'error';
        session.error = `Failed to spawn python process: ${err.message}`;
        this.broadcastToSession(sessionId, { type: 'status', data: { status: session.status, error: session.error } });
      });

      session.process = streamProcess;
      session.taskPid = streamProcess.pid;
      session.status = 'running';
      session.logs.push(`Stream processor started with PID ${streamProcess.pid}`);

      // Handle process output
      streamProcess.stdout?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        session.logs.push(`[STDOUT] ${message}`);
        this.broadcastToSession(sessionId, { type: 'log', data: { message } });
      });

      streamProcess.stderr?.on('data', (data: Buffer) => {
        let message = data.toString();
        // Strip ANSI color codes
        message = message.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '').trim();
        session.logs.push(`[STDERR] ${message}`);
        const firstLine = message.split('\n')[0];
        this.broadcastToSession(sessionId, { type: 'error', data: { message: firstLine } });
      });

      streamProcess.on('close', (code: number | null) => {
        session.status = code === 0 ? 'stopped' : 'error';
        session.logs.push(`Process exited with code ${code}`);
        if (code !== 0) {
          session.error = `Process exited with code ${code}`;
        }
        this.broadcastToSession(sessionId, { 
          type: 'status', 
          data: { status: session.status, error: session.error } 
        });
      });

      streamProcess.on('error', (error: Error) => {
        session.status = 'error';
        session.error = error.message;
        session.logs.push(`Process error: ${error.message}`);
        this.broadcastToSession(sessionId, { 
          type: 'status', 
          data: { status: session.status, error: session.error } 
        });
      });

      this.broadcastToSession(sessionId, { type: 'status', data: { status: session.status } });

    } catch (error) {
      session.status = 'error';
      session.error = error instanceof Error ? error.message : 'Unknown error';
      session.logs.push(`Failed to start stream: ${session.error}`);
      this.broadcastToSession(sessionId, { 
        type: 'status', 
        data: { status: session.status, error: session.error } 
      });
      throw error;
    }
  }

  async stopStream(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'running') {
      return; // Already stopped or not running
    }

    session.status = 'stopping';
    session.logs.push('Stopping stream...');
    this.broadcastToSession(sessionId, { type: 'status', data: { status: session.status } });

    if (session.process) {
      try {
        // Kill the process tree
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', session.process.pid!.toString(), '/t', '/f']);
        } else {
          process.kill(-session.process.pid!);
        }
      } catch (error) {
        session.logs.push(`Error killing process: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    session.status = 'stopped';
    session.process = undefined;
    session.taskPid = undefined;
    session.logs.push('Stream stopped');
    this.broadcastToSession(sessionId, { type: 'status', data: { status: session.status } });
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      return; // Session doesn't exist
    }

    // Stop stream if running
    if (session.status === 'running') {
      await this.stopStream(sessionId);
    }

    // Close all SSE connections
    session.sseClients.forEach(client => {
      try {
        client.end();
      } catch (error) {
        // Ignore errors when closing connections
      }
    });

    // Optionally delete clips directory
    try {
      if (fs.existsSync(session.outDir)) {
        fs.rmSync(session.outDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn(`Failed to delete session directory ${session.outDir}:`, error);
    }

    this.sessions.delete(sessionId);
  }

  getSessionClips(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    if (!session) {
      return [];
    }

    try {
      if (!fs.existsSync(session.outDir)) {
        return [];
      }

      return fs.readdirSync(session.outDir)
        .filter(file => file.endsWith('.mp4') || file.endsWith('.mkv'))
        .map(file => path.join(session.outDir, file));
    } catch (error) {
      return [];
    }
  }

  addSSEClient(sessionId: string, client: ExpressResponse): void {
  console.log(`[TRACE] SSE connect: sessionId=${sessionId}`);
    const session = this.getSession(sessionId);
    if (session) {
      session.sseClients.add(client);
      
      // Remove client when connection closes
      client.on('close', () => {
        session.sseClients.delete(client);
      });
    }
  }

  private broadcastToSession(sessionId: string, message: any): void {
  console.log(`[TRACE] SSE emit: sessionId=${sessionId}, message=${JSON.stringify(message)}`);
    const session = this.getSession(sessionId);
    if (!session) return;

    const data = `data: ${JSON.stringify(message)}\n\n`;
    
    session.sseClients.forEach(client => {
      try {
        client.write(data);
      } catch (error) {
        // Remove failed clients
        session.sseClients.delete(client);
      }
    });
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    
    Array.from(this.sessions.entries()).forEach(([sessionId, session]) => {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();
      
      if (timeSinceLastActivity > this.sessionTTL) {
        console.log(`Cleaning up expired session: ${sessionId}`);
        this.deleteSession(sessionId).catch(error => {
          console.error(`Error cleaning up session ${sessionId}:`, error);
        });
      }
    });
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Stop all sessions
    Array.from(this.sessions.keys()).forEach(sessionId => {
      this.deleteSession(sessionId).catch(console.error);
    });
  }
}

export const sessionManager = new SessionManager();
