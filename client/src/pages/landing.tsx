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
import StreamInputForm from "@/components/stream-input-form";
import ProcessingStatus from "@/components/processing-status";
import ClipList from "@/components/clip-list";

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
        {/* Section 1: Stream Configuration */}
        <section className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-2xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-50 mb-4">Configure Your Stream</h2>
              <p className="text-slate-400">Enter your stream URL and start capturing highlights automatically</p>
            </div>
            <StreamInputForm />
          </div>
        </section>

        {/* Section 2: Processing Status */}
        <section className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-4xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-50 mb-4">Live Processing</h2>
              <p className="text-slate-400">Monitor your stream processing in real-time</p>
            </div>
            <ProcessingStatus />
          </div>
        </section>

        {/* Section 3: Clip Library */}
        <section className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-6xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-50 mb-4">Your Captured Clips</h2>
              <p className="text-slate-400">View and manage your automatically generated highlights</p>
            </div>
            <Card className="bg-slate-800 border-slate-600">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl text-slate-50">Recent Clips</CardTitle>
                  <div className="text-sm text-slate-400">
                    Total: {clipsArray.length} clips
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ClipList clips={clipsArray} showActions />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}