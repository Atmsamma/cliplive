import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { useSSE } from "@/hooks/use-sse";
import type { ProcessingStatus } from "@shared/schema";
import LivePlayer from "./live-player";
import PlatformIframePlayer from "./platform-iframe-player";
import { useState, useEffect } from 'react';
import { apiRequest } from "@/lib/queryClient";

export default function ProcessingStatus() {
  const { data: status } = useQuery<ProcessingStatus>({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
  });

  // Get resolved stream URL for active session (decoupled from processing)
  const { data: streamData, error: streamError } = useQuery<{ resolvedStreamUrl: string }>({
    queryKey: ["/api/stream-url"],
    refetchInterval: 60000, // Refresh every 60 seconds to handle token expiration
    refetchOnWindowFocus: true,
    enabled: !!status?.currentSession, // Only fetch when session is active
    retry: 3,
    retryDelay: 5000,
  });

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLoadingStreamUrl, setIsLoadingStreamUrl] = useState<boolean>(false);
  const [displayStreamError, setDisplayStreamError] = useState<string | null>(null);

  // Listen for SSE updates
  useSSE("/api/events");

  // Fetch stream URL when processing starts
  useEffect(() => {
    if (status?.isProcessing && !streamUrl && !isLoadingStreamUrl) {
      setIsLoadingStreamUrl(true);

      const fetchStreamUrl = async () => {
        try {
          const response = await apiRequest("GET", "/api/stream-url");
          const data = await response.json();
          
          if (data.resolvedStreamUrl) {
            if (process.env.NODE_ENV === 'development') {
              console.log('Setting stream URL:', data.resolvedStreamUrl.substring(0, 80) + '...');
            }
            setStreamUrl(data.resolvedStreamUrl);
            setDisplayStreamError(null);
          } else {
            setDisplayStreamError('No stream URL received from server');
          }
        } catch (err) {
          console.error('Failed to fetch stream URL:', err);
          setDisplayStreamError(`Failed to load stream: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
          setIsLoadingStreamUrl(false);
        }
      };

      fetchStreamUrl();
    }
  }, [status?.isProcessing, streamUrl, isLoadingStreamUrl]);


  return (
    <Card className="bg-slate-800 border-slate-600 mb-6">
      <CardContent className="pt-6">
        <div className="flex flex-col h-full">
          {/* Status Header */}
          <div className="text-center mb-4">
            <div className="text-2xl font-bold mb-1">
              <span className="text-red-400">
                Ready to Clip Live
              </span>
            </div>
            <div className="text-sm text-slate-400">
              {status?.streamUptime || "00:00:00"}
            </div>
          </div>

          {/* Stream Player / Preview */}
          <div className="bg-slate-700 rounded-lg aspect-video flex items-center justify-center relative overflow-hidden">
            {status?.currentSession?.url ? (
              <PlatformIframePlayer
                streamUrl={status.currentSession.url}
                className="w-full h-full"
              />
            ) : (
              <div className="text-center text-slate-400">
                <div className="text-4xl mb-2">🎬</div>
                <div>Ready to start clipping</div>
              </div>
            )}
          </div>

          {/* Processing Status - only show when actively processing without any connection issues */}
          {status?.isProcessing && status?.framesProcessed > 0 && !status?.consecutiveFailures && !status?.streamEnded && (
            <div className="mt-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-50 mb-1">
                  {status.framesProcessed}
                </div>
                <div className="text-xs text-slate-400">
                  frames processed
                </div>
              </div>
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
}
