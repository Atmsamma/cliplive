import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { useSSE } from "@/hooks/use-sse";
import type { ProcessingStatus } from "@shared/schema";
import LivePlayer from "./live-player";
import PlatformIframePlayer from "./platform-iframe-player";
import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/use-session';

interface Props { sessionId?: string }
export default function ProcessingStatus({ sessionId: propSessionId }: Props) {
  const { sessionId: ctxSessionId, isSessionReady: ctxReady } = useSession();
  const sessionId = propSessionId || ctxSessionId;
  const isSessionReady = !!sessionId && (propSessionId ? true : ctxReady);
  
  const { data: session } = useQuery({
    queryKey: ['session', sessionId, 'status'],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID available');
      const response = await fetch(`/api/sessions/${sessionId}/status`);
      if (!response.ok) throw new Error('Failed to fetch session status');
      return response.json();
    },
    refetchInterval: 1000,
    enabled: isSessionReady && !!sessionId,
  });

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLoadingStreamUrl, setIsLoadingStreamUrl] = useState<boolean>(false);
  const [displayStreamError, setDisplayStreamError] = useState<string | null>(null);

  // Listen for SSE updates from session
  useSSE(sessionId || '');

  // Clear stream URL when session changes
  useEffect(() => {
    const isProcessing = session?.status === 'running';
    if (!isProcessing) {
      setStreamUrl(null);
      setDisplayStreamError(null);
      setIsLoadingStreamUrl(false);
    }
  }, [session?.status]);

  return (
    <Card className="bg-slate-800 border-slate-600 mb-6">
      <CardContent className="pt-6">
        <div className="flex flex-col h-full">
          {/* Status Header */}
          <div className="text-center mb-4">
            <div className="text-2xl font-bold mb-1">
            </div>
          </div>

          {/* Stream Player / Preview */}
          <div className="bg-slate-700 rounded-lg aspect-video flex items-center justify-center relative overflow-hidden">
            {session?.stream_url ? (
              <PlatformIframePlayer
                streamUrl={session.stream_url}
                className="w-full h-full"
              />
            ) : (
              <div className="text-center text-slate-400">
                <div className="text-4xl mb-2">🎬</div>
                <div>Ready to start clipping</div>
              </div>
            )}
          </div>

          {/* Processing Status - only show when actively processing */}
          {session?.status === 'running' && (
            <div className="mt-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-50 mb-1">
                  Active
                </div>
                <div className="text-xs text-slate-400">
                  session running
                </div>
              </div>
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
}
