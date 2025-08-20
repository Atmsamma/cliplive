import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
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
  private currentClipId: number;
  private currentSessionId: number;

  constructor() {
    this.clips = new Map();
    this.streamSessions = new Map();
    this.currentClipId = 1;
    this.currentSessionId = 1;
  }

  // Users
  async createUser(user: InsertUser): Promise<User> {
    const id = this.currentClipId++; // Reusing clipId for user ID for simplicity in this in-memory example
    const newUser: User = {
      ...user,
      id,
      createdAt: new Date(),
    };
    // In a real app, you'd use a database here. For MemStorage, we'll just simulate it.
    // For now, we'll return a dummy user as we don't have a user map.
    console.warn("createUser: Using dummy user data as MemStorage doesn't support user persistence.");
    return { ...newUser, id: this.currentClipId++ }; // Return a mock user
  }

  async getUserByReplitId(replitUserId: string): Promise<User | undefined> {
    console.warn("getUserByReplitId: MemStorage does not persist users. Returning undefined.");
    return undefined;
  }

  async getUser(id: number): Promise<User | undefined> {
    console.warn("getUser: MemStorage does not persist users. Returning undefined.");
    return undefined;
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

// The original code used MemStorage. To incorporate user account creation,
// we need a persistent storage solution like SQLite.
// The following is a placeholder for a SQLite storage implementation.
// In a real application, you would replace MemStorage with SQLiteStorage
// and handle the database connection and migrations.

export class SQLiteStorage implements IStorage {
  private db: ReturnType<typeof drizzle<typeof Database>>;

  constructor(dbPath: string) {
    const sqlite = new Database(dbPath);
    this.db = drizzle(sqlite);
  }

  // Users
  async createUser(user: InsertUser): Promise<User> {
    const [insertedUser] = await this.db.insert(users).values(user).returning();
    return insertedUser;
  }

  async getUserByReplitId(replitUserId: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.replitUserId, replitUserId)).limit(1);
    return user;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  // Clips
  async createClip(clip: InsertClip): Promise<Clip> {
    const [insertedClip] = await this.db.insert(clips).values(clip).returning();
    return insertedClip;
  }

  async getClips(userId?: number): Promise<Clip[]> {
    if (userId) {
      return await this.db.select().from(clips).where(eq(clips.userId, userId)).orderBy(desc(clips.createdAt));
    }
    return await this.db.select().from(clips).orderBy(desc(clips.createdAt));
  }

  async getClip(id: number): Promise<Clip | undefined> {
    const [clip] = await this.db.select().from(clips).where(eq(clips.id, id)).limit(1);
    return clip;
  }

  async deleteClip(id: number): Promise<boolean> {
    const result = await this.db.delete(clips).where(eq(clips.id, id)).returning({ id: clips.id });
    return result.length > 0;
  }

  // Stream Sessions
  async createStreamSession(insertSession: InsertStreamSession): Promise<StreamSession> {
    const [insertedSession] = await this.db.insert(streamSessions).values(insertSession).returning();
    return insertedSession;
  }

  async getActiveSession(userId?: number): Promise<StreamSession | undefined> {
    if (userId) {
      const [session] = await this.db.select().from(streamSessions).where(and(eq(streamSessions.isActive, true), eq(streamSessions.userId, userId))).limit(1);
      return session;
    }
    const [session] = await this.db.select().from(streamSessions).where(eq(streamSessions.isActive, true)).limit(1);
    return session;
  }

  async updateSessionStatus(id: number, isActive: boolean): Promise<StreamSession | undefined> {
    const [updatedSession] = await this.db.update(streamSessions).set({ isActive, stoppedAt: !isActive ? new Date() : null }).where(eq(streamSessions.id, id)).returning();
    return updatedSession;
  }

  async getStreamSessions(): Promise<StreamSession[]> {
    return await this.db.select().from(streamSessions).orderBy(desc(streamSessions.startedAt));
  }
}

// In a real application, you'd likely want to initialize the database here.
// For example:
// const storage = new SQLiteStorage("./clips.db");

// For the purpose of this example, we'll keep MemStorage as the default export,
// but the SQLiteStorage class is provided with the new user methods.
export const storage = new MemStorage();