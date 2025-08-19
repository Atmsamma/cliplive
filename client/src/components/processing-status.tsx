import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { useSSE } from "@/hooks/use-sse";
import type { ProcessingStatus } from "@shared/schema";
import LivePlayer from "./live-player";
import { useState, useEffect } from 'react';

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

      console.log('Fetching stream URL...');

      fetch('/api/stream-url')
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
  }, [status?.isProcessing, streamUrl, isLoadingStreamUrl]);


  return (
    <Card className="bg-slate-800 border-slate-600 mb-6">
      <CardContent className="pt-6">
        <div className="flex flex-col h-full">
          {/* Status Header */}
          <div className="text-center mb-4">
            <div className="text-2xl font-bold mb-1">
              <span className={
                status?.streamEnded ? 'text-red-400' :
                status?.currentSession ? 'text-red-400' : 'text-slate-400'
              }>
                {status?.streamEnded ? 'ENDED' :
                 status?.currentSession ? 'Ready to Clip Live' : 'IDLE'}
              </span>
            </div>
            <div className="text-sm text-slate-400">
              {status?.streamUptime || "00:00:00"}
            </div>
            {status?.streamEnded && (
              <div className="text-xs text-red-400 mt-1">
                Stream no longer available
              </div>
            )}
            {status?.consecutiveFailures && status.consecutiveFailures > 0 && status.consecutiveFailures < 5 && (
              <div className="text-xs text-yellow-400 mt-1">
                Connection issues ({status.consecutiveFailures}/5)
              </div>
            )}
          </div>

          {/* Stream Player / Preview */}
          <div className="bg-slate-700 rounded-lg p-4 aspect-video flex items-center justify-center relative overflow-hidden">
          {isLoadingStreamUrl ? (
            <div className="flex items-center justify-center h-full bg-slate-700 rounded-lg">
              <div className="text-white text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                <div>Loading stream...</div>
                <div className="text-xs text-slate-400 mt-1">Resolving stream URL...</div>
              </div>
            </div>
          ) : displayStreamError ? (
            <div className="text-center text-red-400">
              <div className="text-2xl mb-2">⚠️</div>
              <div className="text-sm mb-2">{displayStreamError}</div>
              <div className="text-xs text-slate-400 mb-2">
                Check console for details
              </div>
              <button 
                onClick={() => {
                  console.log('Retrying stream URL fetch...');
                  setDisplayStreamError(null);
                  setStreamUrl(null);
                  setIsLoadingStreamUrl(false);
                }}
                className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-xs"
              >
                Retry Stream Load
              </button>
            </div>
          ) : streamUrl ? (
            <LivePlayer 
              streamUrl={streamUrl} 
              onError={(error) => {
                console.error('LivePlayer error:', error);
                setDisplayStreamError('Stream playback failed - check browser console');
              }}
            />
          ) : status?.isProcessing ? (
            <div className="text-center text-slate-400">
              <div className="text-2xl mb-2">📺</div>
              <div>Waiting for stream URL...</div>
              <div className="text-xs text-slate-300 mt-1">
                Processing: {status.framesProcessed} frames
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-400">
              <div className="text-4xl mb-2">🎬</div>
              <div>Ready to start streaming</div>
            </div>
          )}
        </div>

          {/* Status Details (if session is active) */}
          {status?.currentSession && (
            <div className="mt-4 text-center">
              <div className="text-xs text-slate-400">
                Stream Source: {status.currentSession.url}
              </div>
              {streamData?.resolvedStreamUrl && (
                <div className="text-xs text-slate-500 mt-1">
                  Resolved URL: {streamData.resolvedStreamUrl.substring(0, 80)}...
                </div>
              )}
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
}