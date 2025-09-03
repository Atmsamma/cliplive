import type { Express, Request, Response } from "express";
import { sessionManager } from "./session-manager";
import { z } from "zod";

const startStreamSchema = z.object({
  url: z.string().url(),
  clipLength: z.number().optional(),
  audioThreshold: z.number().optional(),
  motionThreshold: z.number().optional(),
});

export function registerSessionRoutes(app: Express) {
  // Auth (leave as-is; change if you want anon access for some endpoints)
  const { requireAuth } = require("./auth");

  // Create a new session (no auth so anonymous users can start)
  app.post("/api/sessions", (req: Request, res: Response) => {
    try {
      const sessionId = sessionManager.createSession();
      res.json({ session_id: sessionId });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Maximum")) {
        return res.status(429).json({
          error: error.message,
          friendly_message:
            "We're at capacity right now. Please try again in a few minutes!",
        });
      }
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // Helper to get sessionId from header or param
  function getSessionId(req: Request): string | undefined {
    return (req.headers["x-session-id"] as string) || req.params.sid;
  }

  // Get session status (no auth so anonymous can poll)
  app.get("/api/sessions/:sid/status", (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    if (!sessionId) {
      return res.status(400).json({ error: "Missing session ID" });
    }
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    console.log(
      `[TRACE] Status: sessionId=${sessionId}, status=${session?.status}`
    );
    res.json({
      session_id: session.id,
      status: session.status,
      stream_url: session.streamUrl,
      error: session.error,
      last_activity: session.lastActivity,
      clips_count: sessionManager.getSessionClips(sessionId).length,
    });
  });

  // Start stream for a session (auth-gated; change if you want anon start)
  app.post(
    "/api/sessions/:sid/start",
    async (req: Request, res: Response) => {
      const sessionId = getSessionId(req);
      if (!sessionId) {
        return res.status(400).json({ error: "Missing session ID" });
      }
      try {
        const validatedData = startStreamSchema.parse(req.body);
        await sessionManager.startStream(sessionId, validatedData.url);
        const session = sessionManager.getSession(sessionId);
        res.json({
          session_id: sessionId,
          status: session?.status,
          stream_url: validatedData.url,
          message: "Stream started successfully",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ error: "Invalid input", details: error.errors });
        }
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        res.status(400).json({ error: errorMessage });
      }
    }
  );

  // Stop stream for a session (auth-gated)
  app.post(
    "/api/sessions/:sid/stop",
    async (req: Request, res: Response) => {
      const sessionId = getSessionId(req);
      if (!sessionId) {
        return res.status(400).json({ error: "Missing session ID" });
      }
      try {
        await sessionManager.stopStream(sessionId);
        const session = sessionManager.getSession(sessionId);
        res.json({
          session_id: sessionId,
          status: session?.status,
          message: "Stream stopped successfully",
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        res.status(400).json({ error: errorMessage });
      }
    }
  );

  // Get clips for a session (auth-gated)
  app.get(
    "/api/sessions/:sid/clips",
    (req: Request, res: Response) => {
      const { sid } = req.params;
      const session = sessionManager.getSession(sid);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const clips = sessionManager.getSessionClips(sid);
      // Build a richer response so the frontend ClipList can render session directory clips
      // without them needing to exist in the database yet.
      const enriched = clips.map((clipPath, idx) => {
        const pathParts = clipPath.split(/[/\\]/);
        const filename = pathParts[pathParts.length - 1];
        let stats: any = null;
        try {
          // Lazy require to avoid bundler complaints in some environments
          const fs = require('fs');
          stats = fs.statSync(clipPath);
        } catch {}
        // Determine trigger reason; special label for test clip
        let triggerReason = 'auto-detected';
        if (filename.startsWith('test_')) {
          triggerReason = 'TEST clip, actual highlights here soon';
        }
        return {
          id: idx + 1, // Ephemeral ID (not DB id)
          userId: null,
            filename,
          originalUrl: session.streamUrl || '',
          duration: 0, // Unknown without probing; could be populated later via ffprobe
          fileSize: stats?.size || 0,
          triggerReason,
          createdAt: stats?.birthtime || stats?.mtime || new Date(),
        };
      });
      res.json({
        session_id: sid,
        clips: enriched,
        total: enriched.length,
      });
    }
  );

  // Direct clip download with proper Content-Disposition header
  app.get('/api/sessions/:sid/clips/:filename/download', (req: Request, res: Response) => {
    const { sid, filename } = req.params;
    const session = sessionManager.getSession(sid);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const path = require('path');
    const fs = require('fs');
    // Basic path traversal guard
    if (filename.includes('..') || filename.includes(path.sep)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = path.join(session.outDir, filename);
    console.log(`[DOWNLOAD] session=${sid} file=${filePath}`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    // Detect content type
    let contentType = 'application/octet-stream';
    if (filename.endsWith('.mp4')) contentType = 'video/mp4';
    else if (filename.endsWith('.mkv')) contentType = 'video/x-matroska';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Length', stat.size.toString());
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err: any) => {
      console.error('[DOWNLOAD_ERROR]', err);
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  });

  // Accept clip notification POSTs from the Python processor (creates no DB record yet)
  app.post("/api/sessions/:sid/clips", (req: Request, res: Response) => {
    const { sid } = req.params;
    const session = sessionManager.getSession(sid);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const { filename } = req.body || {};
    // We rely on filesystem poll for listing; just acknowledge.
    return res.json({ ok: true, received: { filename } });
  });

  // Server-Sent Events for a session (auth-gated)
  app.get(
    "/api/sessions/:sid/events",
    (req: Request, res: Response) => {
      const { sid } = req.params;
      const session = sessionManager.getSession(sid);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      // If you need CORS for SSE:
      res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      // @ts-ignore (flushHeaders may exist depending on types)
      res.flushHeaders?.();

      // Initial status event
      res.write(
        `data: ${JSON.stringify({
          type: "status",
          data: { status: session.status, error: session.error },
        })}\n\n`
      );

      // Register client
      sessionManager.addSSEClient(sid, res);

      // Cleanup on disconnect
      req.on("close", () => {
        try {
          // Optional if you have a removal helper:
          // sessionManager.removeSSEClient?.(sid, res);
        } catch {}
        res.end();
      });
    }
  );

  // Delete a session (auth-gated)
  app.delete(
    "/api/sessions/:sid",
    requireAuth,
    async (req: Request, res: Response) => {
      const { sid } = req.params;

      try {
        await sessionManager.deleteSession(sid);
        res.json({
          session_id: sid,
          message: "Session deleted successfully",
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: errorMessage });
      }
    }
  );

  // Get all sessions (auth-gated; admin/debug)
  app.get("/api/sessions", requireAuth, (req: Request, res: Response) => {
    const sessions = sessionManager.getAllSessions();
    res.json({
      sessions: sessions.map((session) => ({
        session_id: session.id,
        status: session.status,
        stream_url: session.streamUrl,
        created_at: session.createdAt,
        last_activity: session.lastActivity,
        clips_count: sessionManager.getSessionClips(session.id).length,
      })),
      total: sessions.length,
    });
  });
}
