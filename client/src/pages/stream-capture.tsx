import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StreamInputForm from "@/components/stream-input-form";
import ProcessingStatus from "@/components/processing-status";
import ClipList from "@/components/clip-list";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Clip } from "@shared/schema";
import { useSession } from "@/hooks/use-session";

// NOTE: This page previously used a separate sessionManager singleton that
// created its own session IDs independent of the SessionProvider. That caused
// multiple concurrent session polls & start attempts (404 spam). We now unify
// everything on SessionProvider so only one authoritative session exists.

export default function StreamCapture() {
  const { toast } = useToast();
  const { sessionId, isSessionReady } = useSession();

  const { data: status } = useQuery({
    queryKey: ["session", sessionId, "status"],
    queryFn: async () => {
      if (!sessionId) throw new Error("No session ID available");
      const res = await fetch(`/api/sessions/${sessionId}/status`);
      if (!res.ok) throw new Error("Failed to fetch session status");
      return res.json();
    },
    refetchInterval: 1000,
    enabled: isSessionReady && !!sessionId,
  });

  const { data: clips } = useQuery<Clip[]>({
    queryKey: ["session", sessionId, "clips"],
    queryFn: async () => {
      if (!sessionId) throw new Error("No session ID available");
      const res = await fetch(`/api/sessions/${sessionId}/clips`);
      if (!res.ok) throw new Error("Failed to fetch clips");
      return res.json();
    },
    refetchInterval: 5000,
    enabled: isSessionReady && !!sessionId,
  });

  const handleDownloadAll = async () => {
    try {
      // For now, just show a message since download-all needs to be implemented for sessions
      toast({
        title: "Download All",
        description: "Download all functionality will be implemented for session-based clips",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download clips",
        variant: "destructive",
      });
    }
  };

  // Ensure clips is always an array and handle undefined case
  const clipsArray = Array.isArray(clips) ? clips : [];
  const totalSize = clipsArray.reduce((sum: number, clip: any) => sum + (clip.fileSize || 0), 0);
  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <>
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-50">Stream Capture</h2>
            <p className="text-slate-400 text-sm">Real-time stream monitoring - clips are created instantly as highlights occur</p>
          </div>
          <div className="flex items-center space-x-4">
            {/* Processing Status Badge */}
            <div className="flex items-center space-x-2 px-3 py-1 bg-slate-700 rounded-full text-sm">
              <div className={`w-2 h-2 rounded-full ${status?.status === 'running' ? "bg-red-500 animate-pulse" : "bg-slate-500"}`} />
              <span className="text-slate-300">
                {status?.status === 'running' ? "Processing" : "Ready"}
              </span>
            </div>

            {/* Download All Button */}
            <Button
              variant="outline"
              onClick={handleDownloadAll}
              disabled={clipsArray.length === 0}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600"
            >
              <Download size={16} className="mr-2" />
              Download All
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-6">
        {/* Clip Configuration and Processing Status Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <StreamInputForm />
          <ProcessingStatus />
        </div>

        {/* Recent Clips */}
        <div className="bg-slate-800 rounded-xl border border-slate-600 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium flex items-center space-x-2 text-slate-50">
              <span>Recent Clips</span>
            </h3>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-400">Total: {clipsArray.length} clips</span>
              <div className="text-sm text-slate-400">•</div>
              <span className="text-sm text-slate-400">{formatSize(totalSize)}</span>
            </div>
          </div>

          <ClipList clips={clipsArray} showActions />
        </div>
      </main>
    </>
  );
}