import { clips, streamSessions, type Clip, type InsertClip, type StreamSession, type InsertStreamSession } from "@shared/schema";

export interface IStorage {
  // Clips
  createClip(clip: InsertClip): Promise<Clip>;
  getClips(): Promise<Clip[]>;
  getClip(id: number): Promise<Clip | undefined>;
  deleteClip(id: number): Promise<boolean>;

  // Stream Sessions
  createStreamSession(session: InsertStreamSession): Promise<StreamSession>;
  getActiveSession(): Promise<StreamSession | undefined>;
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

  async getClips(): Promise<Clip[]> {
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
}

export const storage = new MemStorage();