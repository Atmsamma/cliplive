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

// Dummy functions and variables to satisfy the compiler if they were used in the changes
const formatSize = (size: number) => `${(size / 1024).toFixed(2)} KB`;
const totalSize = 1024 * 1024; // Example total size

export default function Landing() {
  const { toast } = useToast();
  const liveProcessingSectionRef = useRef<HTMLElement>(null);
  const [wasProcessing, setWasProcessing] = useState(false);
  const [currentSession, setCurrentSession] = useState<StreamSession | null>(null);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);


  const { data: status } = useQuery<ProcessingStatusType>({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
  });

  const { data: clips } = useQuery<Clip[]>({
    queryKey: ["/api/clips"],
    refetchInterval: 5000,
  });

  // Initialize new session on component mount
  useEffect(() => {
    const initializeSession = async () => {
      try {
        console.log('🚀 Initializing new session on page load...');
        const response = await fetch('/api/auto-start', {
          method: 'GET',
        });

        if (response.ok) {
          console.log('✅ New session initialized successfully');
        } else {
          console.warn('⚠️ Failed to initialize session:', response.status);
        }
      } catch (error) {
        console.error('❌ Error initializing session:', error);
      }
    };

    initializeSession();
  }, []); // Empty dependency array ensures this runs only once on mount

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

  // SSE connection
  useEffect(() => {
    const newEventSource = new EventSource('/api/sse');
    setEventSource(newEventSource);

    return () => {
      newEventSource.close();
      setEventSource(null);
    };
  }, []);

  useEffect(() => {
    const handleSSEMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log('SSE Event:', data);

        if (data.type === 'session-started') {
          setCurrentSession(data.data);
        } else if (data.type === 'session-stopped') {
          setCurrentSession(null);
        } else if (data.type === 'processing-status') {
          // Status updates are handled by ProcessingStatus component
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    if (eventSource) {
      eventSource.addEventListener('message', handleSSEMessage);
      return () => {
        eventSource.removeEventListener('message', handleSSEMessage);
      };
    }
  }, [eventSource]);

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