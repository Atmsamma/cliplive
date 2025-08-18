import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { useSSE } from "@/hooks/use-sse";
import type { ProcessingStatus } from "@shared/schema";

export default function ProcessingStatus() {
  const { data: status } = useQuery<ProcessingStatus>({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
  });

  // Listen for SSE updates
  useSSE("/api/events");

  // Determine animation state based on stream data
  const getAnimationState = () => {
    if (!status?.currentSession) return 'idle';

    const audioLevel = status?.audioLevel || 0;
    const motionLevel = status?.motionLevel || 0;
    const sceneChange = status?.sceneChange || 0;

    // High activity - fast animation
    if (audioLevel > 60 || motionLevel > 60 || sceneChange > 0.8) {
      return 'high';
    }
    // Medium activity - medium animation
    if (audioLevel > 30 || motionLevel > 30 || sceneChange > 0.4) {
      return 'medium';
    }
    // Low activity - slow animation
    if (audioLevel > 10 || motionLevel > 10 || sceneChange > 0.1) {
      return 'low';
    }

    return 'idle';
  };

  const animationState = getAnimationState();

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
            
          </div>

          {/* Static Stream Screenshot - Full Size */}
          <div className="relative flex-1 bg-slate-700 rounded-lg overflow-hidden border border-slate-600 min-h-48">
            {status?.currentSession ? (
              <>
                <img 
                  src={`/api/current-frame?session=${status.currentSession.id}&t=${Date.now()}`}
                  alt="Stream screenshot"
                  className="w-full h-full object-cover"
                  onLoad={() => {
                    console.log('Frame loaded successfully');
                  }}
                  onError={(e) => {
                    console.log('Frame load error, showing fallback');
                    const img = e.currentTarget as HTMLImageElement;
                    img.style.display = 'none';
                  }}
                />
                <div 
                  className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-700"
                  style={{ display: 'none' }}
                  id="fallback-placeholder"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-2">📸</div>
                    <div className="text-lg">Capturing Frame...</div>
                    <div className="text-sm text-slate-500 mt-2">Stream screenshot will appear here</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-2">⏸️</div>
                  <div className="text-lg">No Stream</div>
                  <div className="text-sm text-slate-500 mt-2">Enter a URL and click Start Clipping</div>
                </div>
              </div>
            )}</div>

            {/* Activity indicator overlay */}
            {status?.currentSession && (
              <div className={`absolute top-3 right-3 w-4 h-4 rounded-full ${
                animationState === 'high' ? 'bg-red-500 animate-ping' :
                animationState === 'medium' ? 'bg-red-400 animate-pulse' :
                animationState === 'low' ? 'bg-red-300 animate-pulse' : 'bg-slate-500'
              }`} />
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
      </CardContent>
    </Card>
  );
}