import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { useSSE } from "@/hooks/use-sse";

export default function ProcessingStatus() {
  const { data: status } = useQuery({
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
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 text-slate-50">
          <TrendingUp className="text-emerald-400" size={20} />
          <span>Processing Status</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8">
          <div className="text-center mb-6">
            <div className="text-3xl font-bold mb-1">
              <span className={
                status?.streamEnded ? 'text-red-400' :
                status?.currentSession ? 'text-emerald-400' : 'text-slate-400'
              }>
                {status?.streamEnded ? 'ENDED' :
                 status?.currentSession ? 'LIVE' : 'IDLE'}
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
            {status?.consecutiveFailures > 0 && status?.consecutiveFailures < 5 && (
              <div className="text-xs text-yellow-400 mt-1">
                Connection issues ({status.consecutiveFailures}/5)
              </div>
            )}
          </div>

          {/* Live Frame Preview */}
          <div className="relative w-48 h-32 mb-4 bg-slate-700 rounded-lg overflow-hidden border border-slate-600">
            {status?.currentFrame ? (
              <img 
                src={`/api/current-frame?t=${Date.now()}`}
                alt="Current frame being processed"
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to placeholder on error
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className={`text-slate-400 text-center ${
                  status?.currentSession ? 'animate-pulse' : ''
                }`}>
                  {status?.currentSession ? (
                    <div>
                      <div className="text-lg mb-1">📹</div>
                      <div className="text-xs">Processing...</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-lg mb-1">⏸️</div>
                      <div className="text-xs">No Stream</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Activity indicator overlay */}
            {status?.currentSession && (
              <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${
                animationState === 'high' ? 'bg-red-500 animate-pulse' :
                animationState === 'medium' ? 'bg-yellow-500 animate-pulse' :
                animationState === 'low' ? 'bg-green-500' : 'bg-slate-500'
              }`} />
            )}
          </div>

          {/* Status Text */}
          <div className="text-center">
            <div className="text-lg font-medium text-slate-300 mb-1">
              {animationState === 'high' ? 'High Activity' :
               animationState === 'medium' ? 'Medium Activity' :
               animationState === 'low' ? 'Low Activity' : 'Monitoring'}
            </div>
            <div className="text-sm text-slate-400">
              {status?.framesProcessed || 0} frames processed
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}