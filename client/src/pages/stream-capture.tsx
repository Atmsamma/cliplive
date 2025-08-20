
import { useEffect, useState } from "react";
import { streamService } from "@/lib/stream-service";
import ProcessingStatus from "@/components/processing-status";
import StreamInputForm from "@/components/stream-input-form";
import ClipList from "@/components/clip-list";
import { useSSE } from "@/hooks/use-sse";

export default function StreamCapture() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize session
  useEffect(() => {
    const initSession = async () => {
      // Wait for session service to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const sid = streamService.getSessionId();
      setSessionId(sid);
      
      if (sid) {
        console.log(`🚀 Initializing session: ${sid}`);
        const status = await streamService.getSessionStatus();
        setSessionStatus(status);
        console.log(`📊 Session status:`, status);
      }
      
      setIsInitialized(true);
    };

    initSession();
  }, []);

  // Listen for SSE events
  useSSE();
  
  // Listen for session status updates
  useEffect(() => {
    const handleSSEEvent = (event: CustomEvent) => {
      const { type, data } = event.detail;
      
      if (type === 'processing-status') {
        setSessionStatus(data);
      }
    };

    window.addEventListener('sse-event', handleSSEEvent as EventListener);
    return () => window.removeEventListener('sse-event', handleSSEEvent as EventListener);
  }, []);

  // Periodic status updates
  useEffect(() => {
    if (!sessionId || !isInitialized) return;

    const interval = setInterval(async () => {
      const status = await streamService.getSessionStatus();
      if (status) {
        setSessionStatus(status);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, isInitialized]);

  if (!isInitialized) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Stream Clipper</h1>
          <p>Initializing session...</p>
        </div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Stream Clipper</h1>
          <p className="text-red-600">Failed to initialize session. Please refresh the page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Stream Clipper</h1>
        <p className="text-sm text-gray-600">Session: {sessionId.slice(0, 8)}...</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <StreamInputForm sessionStatus={sessionStatus} />
          <ProcessingStatus sessionStatus={sessionStatus} />
        </div>
        
        <div>
          <ClipList sessionId={sessionId} />
        </div>
      </div>

      {/* Session Management */}
      <div className="border-t pt-4">
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>Session ID: {sessionId}</span>
          <button
            onClick={() => streamService.deleteSession(false)}
            className="text-red-600 hover:underline"
          >
            End Session
          </button>
        </div>
      </div>
    </div>
  );
}
