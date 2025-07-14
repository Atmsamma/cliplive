
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
            <div className="text-3xl font-bold text-emerald-400 mb-1">
              {status?.currentSession ? 'LIVE' : 'IDLE'}
            </div>
            <div className="text-sm text-slate-400">
              {status?.streamUptime || "00:00:00"}
            </div>
          </div>

          {/* Reactive GIF Animation */}
          <div className="relative w-32 h-32 mb-4">
            <div 
              className={`absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 opacity-20 ${
                animationState === 'high' ? 'animate-ping' :
                animationState === 'medium' ? 'animate-pulse' :
                animationState === 'low' ? 'animate-bounce' : ''
              }`}
            />
            <div 
              className={`absolute inset-2 rounded-full bg-gradient-to-r from-emerald-400 to-blue-400 opacity-40 ${
                animationState === 'high' ? 'animate-spin' :
                animationState === 'medium' ? 'animate-pulse' :
                animationState === 'low' ? 'animate-bounce' : ''
              }`}
            />
            <div 
              className={`absolute inset-4 rounded-full bg-gradient-to-r from-emerald-300 to-blue-300 opacity-60 ${
                animationState === 'high' ? 'animate-bounce' :
                animationState === 'medium' ? 'animate-ping' :
                animationState === 'low' ? 'animate-pulse' : ''
              }`}
            />
            <div 
              className={`absolute inset-8 rounded-full bg-white ${
                animationState === 'high' ? 'animate-pulse' :
                animationState === 'medium' ? 'animate-bounce' :
                animationState === 'low' ? 'animate-ping' : 'opacity-50'
              }`}
            />
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
