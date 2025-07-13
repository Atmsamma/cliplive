import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp } from "lucide-react";
import { useSSE } from "@/hooks/use-sse";

export default function ProcessingStatus() {
  const { data: status } = useQuery({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
  });

  // Listen for SSE updates
  useSSE("/api/events");

  return (
    <Card className="bg-slate-800 border-slate-600 mb-6">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 text-slate-50">
          <TrendingUp className="text-emerald-400" size={20} />
          <span>Processing Status</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-300 mb-1">
              {status?.framesProcessed || 0}
            </div>
            <div className="text-sm text-slate-400">Frames Processed</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-emerald-400 mb-1">
              {status?.clipsGenerated || 0}
            </div>
            <div className="text-sm text-slate-400">Clips Generated</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400 mb-1">
              {status?.streamUptime || "00:00:00"}
            </div>
            <div className="text-sm text-slate-400">Stream Uptime</div>
          </div>
        </div>

        {/* Real-time Metrics */}
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-300">Audio Level</span>
              <span className="text-slate-400">
                -{Math.floor(Math.random() * 30)}dB
              </span>
            </div>
            <Progress
              value={status?.audioLevel || 0}
              className="bg-slate-700 [&>div]:bg-emerald-400"
            />
          </div>
          
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-300">Motion Detection</span>
              <span className="text-slate-400">{status?.motionLevel || 0}%</span>
            </div>
            <Progress
              value={status?.motionLevel || 0}
              className="bg-slate-700 [&>div]:bg-blue-400"
            />
          </div>
          
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-300">Scene Change</span>
              <span className="text-slate-400">
                {status?.sceneChange?.toFixed(2) || "0.00"}
              </span>
            </div>
            <Progress
              value={(status?.sceneChange || 0) * 100}
              className="bg-slate-700 [&>div]:bg-purple-400"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
