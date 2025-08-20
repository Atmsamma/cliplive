import { apiRequest } from "./queryClient";

export interface StreamConfig {
  url: string;
  audioThreshold: number;
  motionThreshold: number;
  clipLength: number;
}

export const streamService = {
  async startCapture(config: StreamConfig) {
    const response = await apiRequest("POST", "/api/start", config);
    return response.json();
  },

  async stopCapture(sessionId?: string) {
    const body = sessionId ? { sessionId } : {};
    const response = await apiRequest("POST", "/api/stop", body);
    return response.json();
  },

  async getStatus(sessionId?: string) {
    const url = sessionId ? `/api/status?sessionId=${sessionId}` : "/api/status";
    const response = await apiRequest("GET", url);
    return response.json();
  },

  async getStreamUrl(sessionId?: string) {
    const url = sessionId ? `/api/stream-url?sessionId=${sessionId}` : "/api/stream-url";
    const response = await apiRequest("GET", url);
    return response.json();
  },

  async getClips() {
    const response = await apiRequest("GET", "/api/clips");
    return response.json();
  },

  async deleteClip(id: number) {
    const response = await apiRequest("DELETE", `/api/clips/${id}`);
    return response.json();
  },

  async downloadAll() {
    const response = await apiRequest("GET", "/api/download-all");
    return response.json();
  },
};
