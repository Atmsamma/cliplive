import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password"), // null for OAuth users
  googleId: text("google_id"), // for Google OAuth
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clips = pgTable("clips", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"), // Nullable to support unauthenticated users
  filename: text("filename").notNull(),
  originalUrl: text("original_url").notNull(),
  duration: integer("duration").notNull(), // in seconds
  fileSize: integer("file_size").notNull(), // in bytes
  triggerReason: text("trigger_reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const streamSessions = pgTable("stream_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"), // Nullable to support unauthenticated users
  url: text("url").notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  audioThreshold: integer("audio_threshold").default(6).notNull(),
  motionThreshold: integer("motion_threshold").default(30).notNull(),
  clipLength: integer("clip_length").default(20).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  stoppedAt: timestamp("stopped_at"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertClipSchema = createInsertSchema(clips).omit({
  id: true,
  createdAt: true,
});

export const insertStreamSessionSchema = createInsertSchema(streamSessions).omit({
  id: true,
  startedAt: true,
  stoppedAt: true,
});

// Session management schemas
export const createSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

export const startSessionSchema = z.object({
  streamUrl: z.string().url(),
  audioThreshold: z.number().min(1).max(20).default(6),
  motionThreshold: z.number().min(1).max(100).default(30),
  clipLength: z.number().min(10).max(120).default(30),
});

export const sessionStatusSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.enum(['idle', 'starting', 'running', 'stopping', 'stopped']),
  streamUrl: z.string().url().optional(),
  isProcessing: z.boolean(),
  framesProcessed: z.number(),
  streamUptime: z.string(),
  audioLevel: z.number(),
  motionLevel: z.number(),
  sceneChange: z.number(),
  clipsGenerated: z.number(),
  processId: z.number().optional(),
  lastError: z.string().optional(),
  createdAt: z.date(),
  lastActivity: z.date(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertClip = z.infer<typeof insertClipSchema>;
export type Clip = typeof clips.$inferSelect;
export type InsertStreamSession = z.infer<typeof insertStreamSessionSchema>;
export type StreamSession = typeof streamSessions.$inferSelect;
export type CreateSession = z.infer<typeof createSessionSchema>;
export type StartSession = z.infer<typeof startSessionSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

// Real-time processing status interface
export interface ProcessingStatus {
  isProcessing: boolean;
  framesProcessed: number;
  streamUptime: string;
  audioLevel: number;
  motionLevel: number;
  sceneChange: number;
  currentSession?: StreamSession;
  streamEnded?: boolean;
  consecutiveFailures?: number;
  lastSuccessfulCapture?: number;
}

// SSE event types
export interface SSEEvent {
  type: 'clip-generated' | 'processing-status' | 'session-started' | 'session-stopped' | 'stream-ended' | 'error';
  data: any;
}
