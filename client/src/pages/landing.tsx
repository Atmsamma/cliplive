import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Clip, ProcessingStatus as ProcessingStatusType, User as UserType } from "@shared/schema";
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

  // Mock user query
  const mockUserId = sessionStorage.getItem('mockUserId');
  const mockUsername = sessionStorage.getItem('mockUsername');

  const { data: user, error: userError } = useQuery<UserType>({
    queryKey: ["/api/user"],
    // Simulate authentication by checking for mock user data
    staleTime: Infinity, // Keep this data fresh
    initialData: mockUserId && mockUsername ? { id: mockUserId, username: mockUsername } : undefined,
    retry: false,
  });

  const { data: status } = useQuery<ProcessingStatusType>({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
    enabled: !!user,
  });

  const { data: clips } = useQuery<Clip[]>({
    queryKey: ["/api/clips"],
    refetchInterval: 5000,
    enabled: !!user,
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
    // Set mock authentication headers for development
    // In production, this would be proper OAuth/JWT
    const mockUserId = `user_${Date.now()}`;
    const mockUsername = `streamer_${Math.random().toString(36).substr(2, 8)}`;

    // Store in sessionStorage for this session
    sessionStorage.setItem('mockUserId', mockUserId);
    sessionStorage.setItem('mockUsername', mockUsername);

    // Navigate to main app
    window.location.href = '/stream-capture';
  };

  const clipsArray = Array.isArray(clips) ? clips : [];
  const isAuthenticated = !!user && !userError;

  return (
    <div className="h-screen bg-slate-900 overflow-y-auto snap-y snap-mandatory">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-600 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Clip Live</h1>
            <p className="text-slate-400 text-sm">Real-time stream monitoring and highlight capture</p>
          </div>
          {isAuthenticated ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-slate-300">
                <User size={16} />
                <span>Welcome, {user.username}!</span>
              </div>
              <Button
                onClick={handleSignIn}
                className="bg-blue-500 hover:bg-blue-600 text-white"
              >
                Go to App
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="text-slate-400 text-sm">Please sign in to continue</div>
              <div id="replit-auth-button"></div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content - Vertical Scrolling Sections */}
      <main className="w-full">
        {!isAuthenticated ? (
          /* Authentication Required Section */
          <section className="h-screen flex items-center justify-center p-6">
            <div className="w-full max-w-2xl text-center">
              <div className="mb-8">
                <h2 className="text-4xl font-bold text-slate-50 mb-4">Welcome to Clip Live</h2>
                <p className="text-slate-400 text-lg mb-8">Real-time stream monitoring and highlight capture</p>
                <p className="text-slate-300 mb-8">Sign in with your Replit account to start capturing highlights from your favorite streams.</p>
                <div className="flex justify-center">
                  <div id="replit-auth-container"></div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
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
          </>
        )}
      </main>
    </div>
  );
}