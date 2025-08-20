
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { streamService } from "@/lib/stream-service";

interface StreamInputFormProps {
  sessionStatus?: any;
}

export default function StreamInputForm({ sessionStatus }: StreamInputFormProps) {
  const [url, setUrl] = useState("");
  const [audioThreshold, setAudioThreshold] = useState(6);
  const [motionThreshold, setMotionThreshold] = useState(30);
  const [clipLength, setClipLength] = useState(30);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isProcessing = sessionStatus?.isProcessing || sessionStatus?.status === 'running';

  const handleStart = async () => {
    if (!url.trim()) {
      setError("Please enter a stream URL");
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      await streamService.startStream(url, audioThreshold, motionThreshold, clipLength);
      console.log("✅ Stream started successfully");
    } catch (error: any) {
      console.error("❌ Failed to start stream:", error);
      setError(error.message || "Failed to start stream");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await streamService.stopStream();
      console.log("✅ Stream stopped successfully");
    } catch (error: any) {
      console.error("❌ Failed to stop stream:", error);
      setError(error.message || "Failed to stop stream");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stream Configuration</CardTitle>
        <CardDescription>
          Configure and start capturing stream highlights
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="url">Stream URL</Label>
          <Input
            id="url"
            placeholder="https://www.twitch.tv/username"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isProcessing}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="audioThreshold">Audio Threshold (dB)</Label>
            <Input
              id="audioThreshold"
              type="number"
              min="1"
              max="20"
              value={audioThreshold}
              onChange={(e) => setAudioThreshold(parseInt(e.target.value))}
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="motionThreshold">Motion Threshold (%)</Label>
            <Input
              id="motionThreshold"
              type="number"
              min="1"
              max="100"
              value={motionThreshold}
              onChange={(e) => setMotionThreshold(parseInt(e.target.value))}
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clipLength">Clip Length (s)</Label>
            <Input
              id="clipLength"
              type="number"
              min="10"
              max="120"
              value={clipLength}
              onChange={(e) => setClipLength(parseInt(e.target.value))}
              disabled={isProcessing}
            />
          </div>
        </div>

        <div className="flex gap-2">
          {!isProcessing ? (
            <Button 
              onClick={handleStart} 
              disabled={isStarting || !url.trim()}
              className="flex-1"
            >
              {isStarting ? "Starting..." : "Start Capture"}
            </Button>
          ) : (
            <Button 
              onClick={handleStop} 
              variant="destructive"
              className="flex-1"
            >
              Stop Capture
            </Button>
          )}
        </div>

        {sessionStatus && (
          <div className="text-sm text-gray-600">
            Status: {sessionStatus.status || 'Unknown'} | 
            Clips: {sessionStatus.clipsGenerated || 0} | 
            Uptime: {sessionStatus.streamUptime || '00:00:00'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
