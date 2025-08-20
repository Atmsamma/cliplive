import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { SSEEvent } from "@shared/schema";
import { useState } from "react";
import type { ProcessingStatus, Clip } from "@/types";

export function useSSE() {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Generate session ID if not exists
    const currentSessionId = sessionId || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    if (!sessionId) {
      setSessionId(currentSessionId);
    }

    const eventSource = new EventSource(`/api/events?sessionId=${currentSessionId}`);

    eventSource.onmessage = (event) => {
      const data: SSEEvent = JSON.parse(event.data);

      switch (data.type) {
        case 'session-connected':
          setSessionId(data.data.sessionId);
          setStatus(data.data.processingStatus);
          break;
        case 'processing-status':
          setStatus(data.data);
          break;
        case 'clip-generated':
          setClips(prev => [data.data, ...prev]);
          break;
        case 'session-started':
          setStatus(prev => ({ ...prev, isProcessing: true, currentSession: data.data }));
          break;
        case 'session-stopped':
          setStatus(prev => ({ ...prev, isProcessing: false, currentSession: undefined }));
          break;
        case 'stream-ended':
          setStatus(prev => ({ ...prev, isProcessing: false, streamEnded: true }));
          break;
      }
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  return { status, clips, sessionId };
}