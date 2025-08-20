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
