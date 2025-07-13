import { clips, streamSessions, type Clip, type InsertClip, type StreamSession, type InsertStreamSession } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import fs from "fs";
import path from "path";

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

export class DatabaseStorage implements IStorage {
  constructor() {
    // Clear any existing clips directory on startup
    this.clearClipsDirectory();
  }

  private clearClipsDirectory() {
    const clipsDir = path.join(process.cwd(), 'clips');
    
    if (fs.existsSync(clipsDir)) {
      const files = fs.readdirSync(clipsDir);
      files.forEach((file: string) => {
        const filePath = path.join(clipsDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          // Ignore errors when cleaning up
        }
      });
    }
  }

  // Clips
  async createClip(insertClip: InsertClip): Promise<Clip> {
    const [clip] = await db
      .insert(clips)
      .values(insertClip)
      .returning();
    return clip;
  }

  async getClips(): Promise<Clip[]> {
    return await db
      .select()
      .from(clips)
      .orderBy(desc(clips.createdAt));
  }

  async getClip(id: number): Promise<Clip | undefined> {
    const [clip] = await db.select().from(clips).where(eq(clips.id, id));
    return clip || undefined;
  }

  async deleteClip(id: number): Promise<boolean> {
    const result = await db.delete(clips).where(eq(clips.id, id));
    return result.rowCount > 0;
  }

  // Stream Sessions
  async createStreamSession(insertSession: InsertStreamSession): Promise<StreamSession> {
    const [session] = await db
      .insert(streamSessions)
      .values(insertSession)
      .returning();
    return session;
  }

  async getActiveSession(): Promise<StreamSession | undefined> {
    const [session] = await db
      .select()
      .from(streamSessions)
      .where(eq(streamSessions.isActive, true));
    return session || undefined;
  }

  async updateSessionStatus(id: number, isActive: boolean): Promise<StreamSession | undefined> {
    const [session] = await db
      .update(streamSessions)
      .set({ 
        isActive,
        stoppedAt: !isActive ? new Date() : null,
      })
      .where(eq(streamSessions.id, id))
      .returning();
    return session || undefined;
  }

  async getStreamSessions(): Promise<StreamSession[]> {
    return await db
      .select()
      .from(streamSessions)
      .orderBy(desc(streamSessions.startedAt));
  }
}

export const storage = new DatabaseStorage();
