import { useEffect, useState } from 'react';
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { SSEEvent } from "@shared/schema";

export function useSSE(sessionId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);

  useEffect(() => {
    const url = sessionId ? `/api/events?sessionId=${sessionId}` : '/api/events';
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log(`SSE connected for session: ${sessionId || 'default'}`);
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const sseEvent: SSEEvent = JSON.parse(event.data);
        setLastEvent(sseEvent);

        switch (sseEvent.type) {
          case 'clip-generated':
            toast({
              title: "Highlight Captured!",
              description: `New clip: ${sseEvent.data.filename}`,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/clips"] });
            break;

          case 'processing-status':
            queryClient.setQueryData(["/api/status"], sseEvent.data);
            break;

          case 'session-started':
            toast({
              title: "Stream Capture Started",
              description: "Now monitoring for highlights",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/status"] });
            break;

          case 'session-stopped':
            toast({
              title: "Stream Capture Stopped",
              description: "Processing has been stopped",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/status"] });
            break;

          case 'stream-ended':
            toast({
              title: "Stream Has Ended",
              description: sseEvent.data.message || "The stream is no longer available",
              variant: "destructive",
            });
            // Reset processing status to allow new stream capture
            queryClient.setQueryData(["/api/status"], {
              isProcessing: false,
              framesProcessed: 0,
              streamUptime: "00:00:00",
              audioLevel: 0,
              motionLevel: 0,
              sceneChange: 0,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/status"] });
            break;

          case 'error':
            toast({
              title: "Error",
              description: sseEvent.data.message || "An error occurred",
              variant: "destructive",
            });
            break;
        }
      } catch (error) {
        console.error("Failed to parse SSE event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.log('SSE connection error:', error);
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId, queryClient, toast]);

  return { isConnected, lastEvent };
}