import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StreamInputForm from "@/components/stream-input-form";
import ProcessingStatus from "@/components/processing-status";
import ClipList from "@/components/clip-list";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ProcessingStatus as ProcessingStatusType, Clip } from "@shared/schema";

export default function StreamCapture() {
  const { toast } = useToast();

  const { data: status } = useQuery<ProcessingStatusType>({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
  });

  const { data: clips } = useQuery<Clip[]>({
    queryKey: ["/api/clips"],
    refetchInterval: 5000,
  });

  const handleDownloadAll = async () => {
    try {
      const response = await apiRequest("GET", "/api/download-all");
      const data = await response.json();

      toast({
        title: "Download All",
        description: data.message || "Download started",
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

  // Initialize new session on component mount
  useEffect(() => {
    const initializeSession = async () => {
      try {
        console.log('🚀 Initializing new session on capture page load...');
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
              <div
                className={`w-2 h-2 rounded-full ${
                  status?.isProcessing ? "bg-red-500 animate-pulse" : "bg-slate-500"
                }`}
              />
              <span className="text-slate-300">
                {status?.isProcessing ? "watching" : "Ready to clip"}
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