import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { useSSE } from "@/hooks/use-sse";
import type { ProcessingStatus } from "@shared/schema";
import VlcPlayer from "react-vlc-player";

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
            {status?.consecutiveFailures && status.consecutiveFailures > 0 && status.consecutiveFailures < 5 && (
              <div className="text-xs text-yellow-400 mt-1">
                Connection issues ({status.consecutiveFailures}/5)
              </div>
            )}
          </div>

          {/* Stream Player / Preview */}
          <div className="relative bg-slate-700 rounded-lg mb-4 min-h-[240px] overflow-hidden">
            {status?.currentSession?.url ? (
              <div className="w-full h-full">
                <VlcPlayer
                  vlcArgs={[
                    '--no-audio',
                    '--network-caching=300',
                    '--clock-jitter=0',
                    '--clock-synchro=0'
                  ]}
                  muted={true}
                  src={status.currentSession.url}
                  style={{
                    width: '100%',
                    height: '240px',
                    borderRadius: '8px'
                  }}
                  onError={(error) => {
                    console.log('VLC Player Error:', error);
                  }}
                />
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

          {/* Additional details */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Motion Detection */}
            <Card className="flex-1 bg-slate-800 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium text-slate-300 flex justify-between items-center">
                  Motion Detection
                  <TrendingUp className="w-4 h-4 text-green-400" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-200">
                  {status?.motionLevel !== undefined ? `${status.motionLevel}%` : '-'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {status?.motionTriggered ? 'Triggered' : 'Idle'}
                </div>
              </CardContent>
            </Card>

            {/* Audio Detection */}
            <Card className="flex-1 bg-slate-800 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium text-slate-300 flex justify-between items-center">
                  Audio Detection
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-200">
                  {status?.audioLevel !== undefined ? `${status.audioLevel}%` : '-'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {status?.audioTriggered ? 'Triggered' : 'Idle'}
                </div>
              </CardContent>
            </Card>

            {/* Scene Change Detection */}
            <Card className="flex-1 bg-slate-800 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium text-slate-300 flex justify-between items-center">
                  Scene Change
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-200">
                  {status?.sceneChange !== undefined ? status.sceneChange.toFixed(2) : '-'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {status?.sceneChangeTriggered ? 'Triggered' : 'Idle'}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}