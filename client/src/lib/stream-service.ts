import { apiRequest } from "./queryClient";

export interface StreamConfig {
  url: string;
  audioThreshold: number;
  motionThreshold: number;
  clipLength: number;
}

export const streamService = {
  async startCapture(sessionId: string, config: StreamConfig) {
    const response = await apiRequest("POST", `/api/sessions/${sessionId}/start`, config);
    return response.json();
  },

  async stopCapture(sessionId: string) {
    const response = await apiRequest("POST", `/api/sessions/${sessionId}/stop`);
    return response.json();
  },

  async getStatus(sessionId: string) {
    const response = await apiRequest("GET", `/api/sessions/${sessionId}/status`);
    return response.json();
  },

  async getClips(sessionId: string) {
    const response = await apiRequest("GET", `/api/sessions/${sessionId}/clips`);
    return response.json();
  },

  async deleteClip(sessionId: string, id: number) {
    const response = await apiRequest("DELETE", `/api/sessions/${sessionId}/clips/${id}`);
    return response.json();
  },

  async downloadAll(sessionId: string) {
    const response = await apiRequest("GET", `/api/sessions/${sessionId}/download-all`);
    return response.json();
  },
};
