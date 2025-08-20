import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Clip, ProcessingStatus as ProcessingStatusType } from "@shared/schema";
import StreamInputForm from "@/components/stream-input-form";
import ProcessingStatus from "@/components/processing-status";
import ClipList from "@/components/clip-list";

export default function LandingPage() {
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Initialize new session on page load
  useEffect(() => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    console.log('🚀 Initializing new session on page load:', newSessionId);
    
    // Store session ID for this tab
    sessionStorage.setItem('streamSessionId', newSessionId);
    
    return () => {
      console.log('✅ New session initialized successfully');
    };
  }, []);

  const { data: clips } = useQuery<Clip[]>({
    queryKey: ["/api/clips"],
    refetchInterval: 5000,
  });

  // Ensure clips is always an array and handle undefined case
  const clipsArray = Array.isArray(clips) ? clips : [];

  console.log('🌟 Landing page ready - multiple concurrent sessions supported');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-4">
            Stream Clipper
          </h1>
          <p className="text-xl text-slate-300 mb-8">
            Automatic highlight detection and clipping for live streams
          </p>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <StreamInputForm sessionId={sessionId} />
          <ProcessingStatus sessionId={sessionId} />
        </div>

        {/* Recent Clips */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">Recent Clips</CardTitle>
          </CardHeader>
          <CardContent>
            <ClipList clips={clipsArray} showActions />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
const totalSize = 1024 * 1024; // Example total size

export default function Landing() {
  const { toast } = useToast();
  const liveProcessingSectionRef = useRef<HTMLElement>(null);
  const [wasProcessing, setWasProcessing] = useState(false);

  const { data: status } = useQuery<ProcessingStatusType>({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
  });

  const { data: clips } = useQuery<Clip[]>({
    queryKey: ["/api/clips"],
    refetchInterval: 5000,
  });

  // Auto-scroll to Live Processing section when processing starts
  useEffect(() => {
    if (status?.isProcessing && !wasProcessing && liveProcessingSectionRef.current) {
      liveProcessingSectionRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }
    setWasProcessing(status?.isProcessing || false);
  }, [status?.isProcessing, wasProcessing]);

  const handleSignIn = () => {
    window.location.href = "/signup";
  };

  const clipsArray = Array.isArray(clips) ? clips : [];

  return (
    <div className="h-screen bg-slate-900 overflow-y-auto snap-y snap-mandatory">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-600 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Clip Live</h1>
            <p className="text-slate-400 text-sm">Real-time stream monitoring and highlight capture</p>
          </div>
          <Button
            onClick={handleSignIn}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            <LogIn size={16} className="mr-2" />
            Sign Up
          </Button>
        </div>
      </header>

      {/* Main Content - Vertical Scrolling Sections */}
      <main className="w-full">
        {/* Section 1: Stream Configuration */}
        <section className="h-screen flex items-center justify-center p-6 snap-start">
          <div className="w-full max-w-2xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-50 mb-4">Configure Your Stream</h2>
              <p className="text-slate-400">Enter your stream URL and start capturing highlights automatically</p>
            </div>
            <StreamInputForm />
          </div>
        </section>

        {/* Section 2: Processing Status */}
        <section ref={liveProcessingSectionRef} className="h-screen flex items-center justify-center p-6 snap-start">
          <div className="w-full max-w-4xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-50 mb-4">Live Processing</h2>
              <p className="text-slate-400">Monitor your stream processing in real-time</p>
            </div>
            <ProcessingStatus />
          </div>
        </section>

        {/* Section 3: Clip Library */}
        <section className="h-screen flex items-center justify-center p-6 snap-start">
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