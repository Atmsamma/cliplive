import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { useSSE } from "@/hooks/use-sse";
import type { ProcessingStatus } from "@shared/schema";
import ReactPlayer from "react-player";

export default function ProcessingStatus() {
  const { data: status } = useQuery<ProcessingStatus>({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
  });

  // Listen for SSE updates
  useSSE("/api/events");

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
          <div className="relative bg-slate-700 rounded-lg mb-4 min-h-[240px] overflow-hidden">
            {status?.currentSession?.resolvedStreamUrl ? (
              <div className="w-full h-full">
                <ReactPlayer
                  url={status.currentSession.resolvedStreamUrl}
                  playing={true}
                  muted={true}
                  width="100%"
                  height="240px"
                  style={{ borderRadius: '8px' }}
                  controls={true}
                  light={false}
                  config={{
                    file: {
                      attributes: {
                        crossOrigin: 'anonymous'
                      },
                      forceHLS: true
                    }
                  }}
                  onReady={() => {
                    console.log('Player ready for HLS:', status.currentSession?.resolvedStreamUrl?.substring(0, 50));
                  }}
                  onStart={() => {
                    console.log('Player started');
                  }}
                  onPlay={() => {
                    console.log('Player playing');
                  }}
                  onError={(error) => {
                    console.error('Player Error:', error);
                  }}
                />
              </div>
            ) : status?.currentSession?.url ? (
              <div className="p-8 flex items-center justify-center h-[240px]">
                <div className="text-center">
                  <div className="text-4xl mb-2">🔄</div>
                  <div className="text-sm text-slate-400">Resolving stream URL...</div>
                </div>
              </div>
            ) : (
              <div className="p-8 flex items-center justify-center h-[240px]">
                <div className="text-6xl">📺</div>
              </div>
            )}

            {/* Recording indicator dot - red camera dot */}
            {status?.currentSession && (
              <div className="absolute top-3 left-3 flex items-center space-x-1">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <div className="text-xs text-white bg-black bg-opacity-60 px-1 py-0.5 rounded">
                  watching
                </div>
              </div>
            )}


          </div>

          
        </div>
      </CardContent>
    </Card>
  );
}