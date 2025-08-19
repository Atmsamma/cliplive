
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Download, Trash2, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Clip, ProcessingStatus as ProcessingStatusType } from "@shared/schema";

export default function Landing() {
  const { toast } = useToast();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const [clipLength, setClipLength] = useState(20);

  const { data: status } = useQuery<ProcessingStatusType>({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
    enabled: isSignedIn,
  });

  const { data: clips } = useQuery<Clip[]>({
    queryKey: ["/api/clips"],
    refetchInterval: 5000,
    enabled: isSignedIn,
  });

  const handleSignIn = () => {
    // Simple authentication simulation - in real app this would be proper auth
    window.location.href = "/capture";
    toast({
      title: "Signed In",
      description: "Welcome to Stream Clipper!",
    });
  };

  const handleStartClipping = async () => {
    if (!streamUrl) {
      toast({
        title: "Error",
        description: "Please enter a stream URL",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/start", { url: streamUrl, clipLength });
      toast({
        title: "Stream Capture Started",
        description: "Now monitoring stream for highlights",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start stream capture",
        variant: "destructive",
      });
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <Card className="bg-slate-800 border-slate-600 w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-slate-50 mb-2">Stream Clipper</CardTitle>
            <p className="text-slate-400">Sign in to start capturing stream highlights</p>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleSignIn}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
            >
              <LogIn size={16} className="mr-2" />
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const clipsArray = Array.isArray(clips) ? clips : [];

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-600 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Stream Clipper</h1>
            <p className="text-slate-400 text-sm">Real-time stream monitoring and highlight capture</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsSignedIn(false)}
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600"
          >
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content - Vertical Scrolling Sections */}
      <main className="w-full">
        {/* Section 1: Stream URL Input */}
        <section className="min-h-screen flex items-center justify-center p-6">
          <Card className="bg-slate-800 border-slate-600 w-full max-w-2xl">
            <CardHeader>
              <CardTitle className="text-xl text-slate-50">Stream Configuration</CardTitle>
              <p className="text-slate-400">Enter your stream URL and start capturing highlights</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-slate-300">Stream URL</Label>
                <Input
                  placeholder="https://www.twitch.tv/username or https://youtube.com/watch?v=..."
                  className="bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                />
                <p className="text-xs text-slate-400">
                  Supports Twitch, YouTube, Kick, and HLS streams - processed in real-time
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Clip Length</Label>
                <Select value={clipLength.toString()} onValueChange={(value) => setClipLength(parseInt(value))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    <SelectItem value="10" className="text-slate-100">10 seconds</SelectItem>
                    <SelectItem value="15" className="text-slate-100">15 seconds</SelectItem>
                    <SelectItem value="20" className="text-slate-100">20 seconds</SelectItem>
                    <SelectItem value="30" className="text-slate-100">30 seconds</SelectItem>
                    <SelectItem value="45" className="text-slate-100">45 seconds</SelectItem>
                    <SelectItem value="60" className="text-slate-100">60 seconds</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleStartClipping}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                size="lg"
              >
                <Play size={20} className="mr-2" />
                Start Clipping
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Section 2: Processing Status */}
        <section className="min-h-screen flex items-center justify-center p-6">
          <Card className="bg-slate-800 border-slate-600 w-full max-w-4xl">
            <CardHeader>
              <CardTitle className="text-xl text-slate-50">Processing Status</CardTitle>
              <p className="text-slate-400">Monitor your stream processing in real-time</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Metrics */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 px-4 py-3 bg-slate-700 rounded-lg">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        status?.isProcessing ? "bg-red-500 animate-pulse" : "bg-slate-500"
                      }`}
                    />
                    <span className="text-slate-300 font-medium">
                      {status?.isProcessing ? "Processing Stream" : "IDLE"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-700 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-slate-100">
                        {status?.framesProcessed || 0}
                      </div>
                      <div className="text-xs text-slate-400">Frames Processed</div>
                    </div>
                    <div className="bg-slate-700 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-slate-100">
                        {status?.streamUptime || "00:00:00"}
                      </div>
                      <div className="text-xs text-slate-400">Stream Uptime</div>
                    </div>
                  </div>

                  {status?.isProcessing && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">Audio Level</span>
                          <span className="text-slate-300">{status.audioLevel || 0}dB</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">Motion Level</span>
                          <span className="text-slate-300">{status.motionLevel || 0}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Stream Preview */}
                <div className="bg-slate-700 rounded-lg aspect-video flex items-center justify-center">
                  {status?.isProcessing ? (
                    <div className="text-center text-slate-400">
                      <div className="text-4xl mb-2">📺</div>
                      <div>Stream Active</div>
                      <div className="text-xs mt-1">Ready to clip highlights</div>
                    </div>
                  ) : (
                    <div className="text-center text-slate-400">
                      <div className="text-4xl mb-2">🎬</div>
                      <div>Ready to start clipping</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 3: Recent Clips */}
        <section className="min-h-screen flex items-center justify-center p-6">
          <Card className="bg-slate-800 border-slate-600 w-full max-w-6xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-slate-50">Recent Clips</CardTitle>
                  <p className="text-slate-400">Your captured stream highlights</p>
                </div>
                <div className="text-sm text-slate-400">
                  Total: {clipsArray.length} clips
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {clipsArray.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <div className="text-4xl mb-4 text-slate-600">🎬</div>
                  <h4 className="text-lg font-medium mb-2 text-slate-300">No clips captured yet</h4>
                  <p className="text-sm">Start capturing a stream and clips will appear here in real-time</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clipsArray.slice(0, 6).map((clip) => (
                    <div
                      key={clip.id}
                      className="bg-slate-700 rounded-lg p-4 hover:bg-slate-650 transition-colors"
                    >
                      {/* Thumbnail */}
                      <div className="w-full h-32 bg-slate-600 rounded flex items-center justify-center text-slate-400 mb-3">
                        <img 
                          src={`/api/thumbnails/${clip.filename}`}
                          alt={`${clip.filename} thumbnail`}
                          className="w-full h-full object-cover rounded"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = 'none';
                            if (target.nextElementSibling) {
                              const fallback = target.nextElementSibling as HTMLElement;
                              fallback.style.display = 'flex';
                            }
                          }}
                        />
                        <div className="flex flex-col items-center justify-center">
                          <Play size={20} className="mb-1" />
                          <span className="text-xs">Preview</span>
                        </div>
                      </div>

                      {/* Clip Info */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-slate-200 truncate">
                          {clip.filename}
                        </h4>
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>{formatDate(clip.createdAt).split(',')[0]}</span>
                          <span>{clip.duration}s</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>{formatSize(clip.fileSize)}</span>
                          <span className="text-emerald-400">NEW</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-2 mt-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-400 hover:text-blue-400 flex-1"
                        >
                          <Play size={12} className="mr-1" />
                          Play
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-slate-400 hover:text-green-400 flex-1"
                          onClick={() => window.open(`/clips/${clip.filename}`, '_blank')}
                        >
                          <Download size={12} className="mr-1" />
                          Get
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
