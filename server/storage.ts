import { eq, desc, and } from "drizzle-orm";
import { clips, streamSessions, users, type InsertClip, type InsertStreamSession, type InsertUser, type Clip, type StreamSession, type User } from "@shared/schema";

export interface IStorage {
  // Users
  createUser(user: InsertUser): Promise<User>;
  getUserByReplitId(replitUserId: string): Promise<User | undefined>;
  getUser(id: number): Promise<User | undefined>;

  // Clips
  createClip(clip: InsertClip): Promise<Clip>;
  getClips(userId?: number): Promise<Clip[]>;
  getClip(id: number): Promise<Clip | undefined>;
  deleteClip(id: number): Promise<boolean>;

  // Stream Sessions
  createStreamSession(session: InsertStreamSession): Promise<StreamSession>;
  getActiveSession(userId?: number): Promise<StreamSession | undefined>;
  updateSessionStatus(id: number, isActive: boolean): Promise<StreamSession | undefined>;
  getStreamSessions(): Promise<StreamSession[]>;
}

export class MemStorage implements IStorage {
  private clips: Map<number, Clip>;
  private streamSessions: Map<number, StreamSession>;
  private users: Map<number, User>;
  private usersByReplitId: Map<string, User>;
  private currentClipId: number;
  private currentSessionId: number;
  private currentUserId: number;

  constructor() {
    this.clips = new Map();
    this.streamSessions = new Map();
    this.users = new Map();
    this.usersByReplitId = new Map();
    this.currentClipId = 1;
    this.currentSessionId = 1;
    this.currentUserId = 1;
  }

  // Users
  async createUser(user: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const newUser: User = {
      ...user,
      id,
      createdAt: new Date(),
    };
    this.users.set(id, newUser);
    this.usersByReplitId.set(user.replitUserId, newUser);
    return newUser;
  }

  async getUserByReplitId(replitUserId: string): Promise<User | undefined> {
    return this.usersByReplitId.get(replitUserId);
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
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

  async getClips(userId?: number): Promise<Clip[]> {
    if (userId) {
      return Array.from(this.clips.values())
        .filter(clip => clip.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return Array.from(this.clips.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async getClip(id: number): Promise<Clip | undefined> {
    return this.clips.get(id);
  }

  async deleteClip(id: number): Promise<boolean> {
    return this.clips.delete(id);
  }

  // Stream Sessions
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

  async getActiveSession(userId?: number): Promise<StreamSession | undefined> {
    if (userId) {
      return Array.from(this.streamSessions.values())
        .filter(session => session.isActive && session.userId === userId)
        .find(session => session.isActive);
    }
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
}

// TODO: Implement SQLiteStorage later when needed for production
// For now, using MemStorage for development

// Using MemStorage for development - can be switched to PostgreSQL later
export const storage = new MemStorage();