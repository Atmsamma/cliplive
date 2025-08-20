
import { users, clips, streamSessions, insertUserSchema, insertClipSchema, insertStreamSessionSchema, type User, type Clip, type StreamSession, type InsertUser, type InsertClip, type InsertStreamSession, type SessionStatus } from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';

export interface IStorage {
  // Clips
  createClip(clip: InsertClip): Promise<Clip>;
  getClips(sessionId?: string): Promise<Clip[]>;
  getClip(id: number): Promise<Clip | undefined>;
  deleteClip(id: number): Promise<boolean>;

  // Stream Sessions
  createStreamSession(session: InsertStreamSession): Promise<StreamSession>;
  getActiveSession(): Promise<StreamSession | undefined>;
  updateSessionStatus(id: number, isActive: boolean): Promise<StreamSession | undefined>;
  getStreamSessions(): Promise<StreamSession[]>;

  // Session Management
  createSession(): Promise<{ sessionId: string }>;
  getSessionStatus(sessionId: string): Promise<SessionStatus | undefined>;
  updateSessionStatus(sessionId: string, status: Partial<SessionStatus>): Promise<void>;
  deleteSession(sessionId: string): Promise<boolean>;
  getAllSessions(): Promise<SessionStatus[]>;
  cleanupExpiredSessions(maxIdleHours: number): Promise<string[]>;

  // Users
  createUser(data: InsertUser): Promise<User>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: number): Promise<User | null>;
  getUserByGoogleId(googleId: string): Promise<User | null>;
}

export class MemStorage implements IStorage {
  private clips: Map<number, Clip>;
  private streamSessions: Map<number, StreamSession>;
  private users: Map<number, User>;
  private sessions: Map<string, SessionStatus>;
  private currentClipId: number;
  private currentSessionId: number;
  private currentUserId: number;

  constructor() {
    this.clips = new Map();
    this.streamSessions = new Map();
    this.users = new Map();
    this.sessions = new Map();
    this.currentClipId = 1;
    this.currentSessionId = 1;
    this.currentUserId = 1;
  }

  // Clips
  async createClip(insertClip: InsertClip): Promise<Clip> {
    const id = this.currentClipId++;
    const clip: Clip = {
      ...insertClip,
      id,
      createdAt: new Date(),
    };
    this.clips.set(id, clip);
    return clip;
  }

  async getClips(sessionId?: string): Promise<Clip[]> {
    const allClips = Array.from(this.clips.values());
    if (sessionId) {
      // Filter clips by session ID (stored in filename or additional field)
      return allClips.filter(clip => 
        clip.filename.includes(`session_${sessionId}`) ||
        (clip as any).sessionId === sessionId
      ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return allClips.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getClip(id: number): Promise<Clip | undefined> {
    return this.clips.get(id);
  }

  async deleteClip(id: number): Promise<boolean> {
    return this.clips.delete(id);
  }

  // Stream Sessions (legacy)
  async createStreamSession(insertSession: InsertStreamSession): Promise<StreamSession> {
    const id = this.currentSessionId++;
    const session: StreamSession = {
      ...insertSession,
      id,
      startedAt: new Date(),
      stoppedAt: null,
    };
    this.streamSessions.set(id, session);
    return session;
  }

  async getActiveSession(): Promise<StreamSession | undefined> {
    return Array.from(this.streamSessions.values()).find(
      session => session.isActive
    );
  }

  async updateSessionStatus(id: number, isActive: boolean): Promise<StreamSession | undefined> {
    const session = this.streamSessions.get(id);
    if (session) {
      const updatedSession = {
        ...session,
        isActive,
        stoppedAt: !isActive ? new Date() : null,
      };
      this.streamSessions.set(id, updatedSession);
      return updatedSession;
    }
    return undefined;
  }

  async getStreamSessions(): Promise<StreamSession[]> {
    return Array.from(this.streamSessions.values()).sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
    );
  }

  // Session Management
  async createSession(): Promise<{ sessionId: string }> {
    const sessionId = uuidv4();
    const session: SessionStatus = {
      sessionId,
      status: 'idle',
      isProcessing: false,
      framesProcessed: 0,
      streamUptime: "00:00:00",
      audioLevel: 0,
      motionLevel: 0,
      sceneChange: 0,
      clipsGenerated: 0,
      createdAt: new Date(),
      lastActivity: new Date(),
    };
    
    this.sessions.set(sessionId, session);
    return { sessionId };
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus | undefined> {
    return this.sessions.get(sessionId);
  }

  async updateSessionStatus(sessionId: string, status: Partial<SessionStatus>): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.sessions.set(sessionId, {
        ...existing,
        ...status,
        lastActivity: new Date(),
      });
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async getAllSessions(): Promise<SessionStatus[]> {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()
    );
  }

  async cleanupExpiredSessions(maxIdleHours: number = 2): Promise<string[]> {
    const expiredSessions: string[] = [];
    const cutoffTime = new Date(Date.now() - (maxIdleHours * 60 * 60 * 1000));
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < cutoffTime && session.status !== 'running') {
        this.sessions.delete(sessionId);
        expiredSessions.push(sessionId);
      }
    }
    
    return expiredSessions;
  }

  // Users
  async createUser(data: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const user = Array.from(this.users.values()).find(
      user => user.email === email
    );
    return user || null;
  }

  async getUserById(id: number): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const user = Array.from(this.users.values()).find(
      user => user.googleId === googleId
    );
    return user || null;
  }
}

export const storage = new MemStorage();
