import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { SSEEvent } from "@shared/schema";

export function useSSE(sessionId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
      // Avoid creating EventSource with an invalid path
      return;
    }

  const eventSource = new EventSource(`/api/sessions/${sessionId}/events`);
  // Tag for debugging multiple concurrent sessions
  (eventSource as any)._sessionId = sessionId;

    eventSource.onmessage = (event) => {
      try {
        const sseEvent: SSEEvent = JSON.parse(event.data);
        
        switch (sseEvent.type) {
          case 'clip-generated':
            toast({
              title: "Highlight Captured!",
              description: `New clip: ${sseEvent.data.filename}`,
            });
            queryClient.invalidateQueries({ queryKey: ["session", sessionId, "clips"] });
            break;
            
          case 'processing-status':
            queryClient.setQueryData(["session", sessionId, "status"], sseEvent.data);
            break;
            
          case 'session-started':
            console.log('[sse] session started');
            queryClient.invalidateQueries({ queryKey: ["session", sessionId, "status"] });
            break;
            
          case 'session-stopped':
            console.log('[sse] session stopped');
            queryClient.invalidateQueries({ queryKey: ["session", sessionId, "status"] });
            break;
            
          case 'stream-ended':
            console.warn('[sse] stream ended', sseEvent.data.message);
            // Reset processing status to allow new stream capture
            queryClient.setQueryData(["session", sessionId, "status"], {
              isProcessing: false,
              framesProcessed: 0,
              streamUptime: "00:00:00",
              audioLevel: 0,
              motionLevel: 0,
              sceneChange: 0,
            });
            queryClient.invalidateQueries({ queryKey: ["session", sessionId, "status"] });
            break;
            
          case 'error':
            console.error('[sse] error event', sseEvent.data.message || sseEvent.data);
            break;
        }
      } catch (error) {
        console.error("Failed to parse SSE event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
    };

    return () => {
      try { eventSource.close(); } catch {}
    };
  }, [sessionId, queryClient, toast]);
}
