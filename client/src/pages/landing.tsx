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
import { useSession } from "@/hooks/use-session";

// Dummy functions and variables to satisfy the compiler if they were used in the changes
const formatSize = (size: number) => `${(size / 1024).toFixed(2)} KB`;
const totalSize = 1024 * 1024; // Example total size

export default function Landing() {
  const { toast } = useToast();
  const liveProcessingSectionRef = useRef<HTMLElement>(null);
  const [wasProcessing, setWasProcessing] = useState(false);
  const { sessionId, isSessionReady } = useSession();

  const { data: status } = useQuery<ProcessingStatusType>({
    queryKey: ["session", sessionId, "status"],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID available');
      const response = await fetch(`/api/sessions/${sessionId}/status`);
      if (!response.ok) throw new Error('Failed to fetch session status');
      return response.json();
    },
    refetchInterval: 1000,
    enabled: isSessionReady && !!sessionId,
  });

  const { data: clips } = useQuery<Clip[]>({
    queryKey: ["session", sessionId, "clips"],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID available');
      const response = await fetch(`/api/sessions/${sessionId}/clips`);
      if (!response.ok) throw new Error('Failed to fetch clips');
      return response.json();
    },
    refetchInterval: 5000,
    enabled: isSessionReady && !!sessionId,
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
  <div className="bg-slate-900 w-full">
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
      <div className="h-screen w-full overflow-hidden">
        <div className="h-full w-full overflow-y-scroll snap-y snap-mandatory hide-scrollbar">
        {/* Section 1: Stream Configuration */}
        <section className="min-h-screen flex items-center justify-center p-6 snap-start">
          <div className="w-full max-w-2xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-50 mb-4">Configure Your Stream</h2>
              <p className="text-slate-400">Enter your stream URL and start capturing highlights automatically</p>
            </div>
            <StreamInputForm />
          </div>
        </section>
        {/* Section 2: Processing Status */}
        <section ref={liveProcessingSectionRef} className="min-h-screen flex items-center justify-center p-6 snap-start">
          <div className="w-full max-w-4xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-50 mb-4">Live Processing</h2>
              <p className="text-slate-400">Monitor your stream processing in real-time</p>
            </div>
            <ProcessingStatus />
          </div>
        </section>
        {/* Section 3: Clip Library */}
        <section className="min-h-screen flex items-center justify-center p-6 snap-start">
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
      </div>
        </div>
    </div>
  );
}