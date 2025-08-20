import { useEffect } from "react";
import { streamService } from "@/lib/stream-service";

export function useSSE(endpoint?: string) {
  useEffect(() => {
    // Use session-specific endpoint
    const eventStreamUrl = endpoint || streamService.getEventStreamUrl();
    const eventSource = new EventSource(eventStreamUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("SSE Event:", data);

        // Dispatch custom events for components to listen to
        window.dispatchEvent(new CustomEvent('sse-event', { detail: data }));
      } catch (error) {
        console.error("Failed to parse SSE data:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
    };

    return () => {
      eventSource.close();
    };
  }, [endpoint]);
}