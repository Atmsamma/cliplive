import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useSSE } from "@/hooks/use-sse";
import { Activity, Clock, Volume2, Camera, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { ProcessingStatus as ProcessingStatusType } from "@shared/schema";
import LivePlayer from "./live-player";
import PlatformIframePlayer from "./platform-iframe-player";
import { useState, useEffect } from 'react';

interface ProcessingStatusProps {
  sessionId: string | null;
}

export default function ProcessingStatus({ sessionId }: ProcessingStatusProps) {
  const { lastEvent } = useSSE(sessionId || undefined);

  const { data: status } = useQuery<ProcessingStatusType>({
    queryKey: ["/api/status", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const response = await apiRequest("GET", `/api/status?sessionId=${sessionId}`);
      return response.json();
    },
    enabled: !!sessionId,
    refetchInterval: 1000,
  });

  // Get resolved stream URL for active session (decoupled from processing)
  const { data: streamData, error: streamError } = useQuery<{ resolvedStreamUrl: string }>({
    queryKey: ["/api/stream-url", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const response = await apiRequest("GET", `/api/stream-url?sessionId=${sessionId}`);
      return response.json();
    },
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
  // useSSE("/api/events"); // This is now handled by useSSE(sessionId || undefined)

  // Fetch stream URL when processing starts
  useEffect(() => {
    if (status?.isProcessing && !streamUrl && !isLoadingStreamUrl) {
      setIsLoadingStreamUrl(true);

      console.log('Fetching stream URL for session:', sessionId);

      fetch(`/api/stream-url?sessionId=${sessionId}`)
        .then(res => {
          console.log('Stream URL response status:', res.status);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          console.log('Stream URL data:', data);
          if (data.resolvedStreamUrl) {
            console.log('Setting stream URL:', data.resolvedStreamUrl.substring(0, 80) + '...');
            setStreamUrl(data.resolvedStreamUrl);
            setDisplayStreamError(null);
          } else {
            console.error('No resolved stream URL in response:', data);
            setDisplayStreamError('No stream URL received from server');
          }
        })
        .catch(err => {
          console.error('Failed to fetch stream URL:', err);
          setDisplayStreamError(`Failed to load stream: ${err.message}`);
        })
        .finally(() => {
          setIsLoadingStreamUrl(false);
        });
    }
  }, [status?.isProcessing, streamUrl, isLoadingStreamUrl, sessionId]);


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