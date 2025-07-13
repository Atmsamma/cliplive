import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Play, Download, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Clip } from "@shared/schema";

interface ClipListProps {
  clips: Clip[];
  showActions?: boolean;
}

export default function ClipList({ clips, showActions = false }: ClipListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/clips/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Clip Deleted",
        description: "The clip has been removed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/clips"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete clip",
        variant: "destructive",
      });
    },
  });

  const handleDownload = (filename: string) => {
    window.open(`/clips/${filename}`, '_blank');
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this clip?")) {
      deleteMutation.mutate(id);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  if (clips.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <div className="text-4xl mb-4 text-slate-600">🎬</div>
        <h4 className="text-lg font-medium mb-2 text-slate-300">No clips captured yet</h4>
        <p className="text-sm">Start capturing a stream to automatically generate highlight clips</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {clips.map((clip) => (
        <div
          key={clip.id}
          className="flex items-center space-x-4 p-4 bg-slate-700 rounded-lg hover:bg-slate-650 transition-colors group"
        >
          {/* Thumbnail placeholder */}
          <div className="w-20 h-12 bg-slate-600 rounded flex items-center justify-center text-slate-400 flex-shrink-0">
            <Play size={16} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <h4 className="text-sm font-medium text-slate-200 truncate">
                {clip.filename}
              </h4>
              <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                NEW
              </span>
            </div>
            <div className="flex items-center space-x-4 text-xs text-slate-400">
              <span>{formatDate(clip.createdAt)}</span>
              <span>{clip.duration}s</span>
              <span>{formatSize(clip.fileSize)}</span>
              <span>{clip.triggerReason}</span>
            </div>
          </div>

          {showActions && (
            <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="p-2 text-slate-400 hover:text-blue-400"
                onClick={() => handleDownload(clip.filename)}
              >
                <Download size={16} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="p-2 text-slate-400 hover:text-red-400"
                onClick={() => handleDelete(clip.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
