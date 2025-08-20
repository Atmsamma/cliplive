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
  sessionId: text("session_id"), // Client session identifier
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertClip = z.infer<typeof insertClipSchema>;
export type Clip = typeof clips.$inferSelect;
export type InsertStreamSession = z.infer<typeof insertStreamSessionSchema>;
export type StreamSession = typeof streamSessions.$inferSelect;

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
