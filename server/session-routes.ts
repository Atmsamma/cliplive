import type { Express, Request, Response } from "express";
import { sessionManager } from "./session-manager";
import { z } from "zod";
import cookie from 'cookie';

const startStreamSchema = z.object({
  url: z.string().url(),
  clipLength: z.number().optional(),
  audioThreshold: z.number().optional(),
  motionThreshold: z.number().optional()
});

export function registerSessionRoutes(app: Express) {
  // Create a new session
  app.post('/api/sessions', (req: Request, res: Response) => {
    try {
      const sessionId = sessionManager.createSession();
      res.json({ session_id: sessionId });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Maximum')) {
        return res.status(429).json({ 
          error: error.message,
          friendly_message: "We're at capacity right now. Please try again in a few minutes!"
        });
      }
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // Helper to get sessionId from header or param
  function getSessionId(req: Request): string | undefined {
    return req.headers['x-session-id'] as string || req.params.sid;
  }

  // Get session status
  app.get('/api/sessions/:sid/status', (req: Request, res: Response) => {
  // ...existing code...
    const sessionId = getSessionId(req);
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session ID' });
    }
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    console.log(`[TRACE] Status: sessionId=${sessionId}, status=${session?.status}`);
    res.json({
      session_id: session.id,
      status: session.status,
      stream_url: session.streamUrl,
      error: session.error,
      last_activity: session.lastActivity,
      clips_count: sessionManager.getSessionClips(sessionId).length
    });
  });

  // Start stream for a session
  app.post('/api/sessions/:sid/start', async (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session ID' });
    }
    try {
      const validatedData = startStreamSchema.parse(req.body);
      await sessionManager.startStream(sessionId, validatedData.url);
      const session = sessionManager.getSession(sessionId);
      res.json({
        session_id: sessionId,
        status: session?.status,
        stream_url: validatedData.url,
        message: 'Stream started successfully'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  // Stop stream for a session
  app.post('/api/sessions/:sid/stop', async (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session ID' });
    }
    try {
      await sessionManager.stopStream(sessionId);
      const session = sessionManager.getSession(sessionId);
      res.json({
        session_id: sessionId,
        status: session?.status,
        message: 'Stream stopped successfully'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  // Get clips for a session
  app.get('/api/sessions/:sid/clips', (req: Request, res: Response) => {
    const { sid } = req.params;
    const session = sessionManager.getSession(sid);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const clips = sessionManager.getSessionClips(sid);
    res.json({
      session_id: sid,
      clips: clips.map(clipPath => ({
        filename: clipPath.split('/').pop() || clipPath.split('\\').pop(),
        path: clipPath,
        created_at: null // TODO: Get file creation time
      }))
    });
  });

  // Server-Sent Events for a session
  app.get('/api/sessions/:sid/events', (req: Request, res: Response) => {
    const { sid } = req.params;
    const session = sessionManager.getSession(sid);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial status
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      data: { 
        status: session.status, 
        error: session.error 
      } 
    })}\n\n`);

    // Add client to session's SSE clients
    sessionManager.addSSEClient(sid, res);

    // Handle client disconnect
    req.on('close', () => {
      res.end();
    });
  });

  // Delete a session
  app.delete('/api/sessions/:sid', async (req: Request, res: Response) => {
    const { sid } = req.params;
    
    try {
      await sessionManager.deleteSession(sid);
      res.json({ 
        session_id: sid,
        message: 'Session deleted successfully' 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get all sessions (for debugging/admin)
  app.get('/api/sessions', (req: Request, res: Response) => {
    const sessions = sessionManager.getAllSessions();
    res.json({
      sessions: sessions.map(session => ({
        session_id: session.id,
        status: session.status,
        stream_url: session.streamUrl,
        created_at: session.createdAt,
        last_activity: session.lastActivity,
        clips_count: sessionManager.getSessionClips(session.id).length
      })),
      total: sessions.length
    });
  });
}
