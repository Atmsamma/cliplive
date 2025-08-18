import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Play, Download, Trash2, X } from "lucide-react";
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
  const [previewingClip, setPreviewingClip] = useState<Clip | null>(null);

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
        <p className="text-sm">Start capturing a stream and clips will appear here in real-time as highlights are detected</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {clips.map((clip) => (
          <div
            key={clip.id}
            className="flex flex-col items-start space-y-3 p-4 bg-slate-700 rounded-lg hover:bg-slate-650 transition-colors group h-fit"
          >
            {/* Video Preview Thumbnail */}
            <div className="w-full h-24 bg-slate-600 rounded flex items-center justify-center text-slate-400 flex-shrink-0 cursor-pointer transition-all duration-200 relative overflow-hidden group thumbnail-container"
                 onClick={() => setPreviewingClip(clip)}>
              <img 
                src={`/api/thumbnails/${clip.filename}`}
                alt={`${clip.filename} thumbnail`}
                className="w-full h-full object-cover transition-transform duration-200"
                loading="lazy"
                onLoad={(e) => {
                  // Hide fallback when image loads successfully
                  const target = e.currentTarget;
                  if (target && target.nextElementSibling) {
                    const fallback = target.nextElementSibling as HTMLElement;
                    fallback.style.display = 'none';
                  }
                }}
                onError={(e) => {
                  // Hide image and show fallback if thumbnail fails to load
                  const target = e.currentTarget;
                  if (target) {
                    target.style.display = 'none';
                    if (target.nextElementSibling) {
                      const fallback = target.nextElementSibling as HTMLElement;
                      fallback.style.display = 'flex';
                    }
                  }
                }}
              />
              {/* Fallback placeholder when image fails to load */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-600">
                <Play size={20} className="mb-1" />
                <span className="text-xs">Preview</span>
              </div>
              {/* Play overlay */}
              <div className="absolute inset-0 play-overlay flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                <div className="bg-white/20 rounded-full p-2 backdrop-blur-sm">
                  <Play size={20} className="text-white fill-white" />
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0 w-full flex flex-col justify-between">
              <div className="flex flex-col space-y-1 mb-2">
                <h4 className="text-xs font-medium text-slate-200 truncate leading-tight">
                  {clip.filename}
                </h4>
                <span className="text-xs text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full w-fit">
                  NEW
                </span>
              </div>
              <div className="flex flex-col gap-1 text-xs text-slate-400 mb-2">
                <div className="flex justify-between items-center">
                  <span className="truncate text-xs">{formatDate(clip.createdAt).split(',')[0]}</span>
                  <span className="text-blue-400 text-xs px-1 py-0.5 bg-blue-400/10 rounded text-center">{clip.triggerReason}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span>{clip.duration}s</span>
                  <span>{formatSize(clip.fileSize)}</span>
                </div>
              </div>
            </div>

            {showActions && (
              <div className="flex items-center space-x-0.5 opacity-100 group-hover:opacity-100 transition-opacity w-full justify-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className="p-1 text-slate-400 hover:text-blue-400 flex-1 min-w-0 h-8"
                  onClick={() => setPreviewingClip(clip)}
                >
                  <Play size={10} className="flex-shrink-0" />
                  <span className="ml-0.5 text-xs hidden xl:inline truncate">Play</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="p-1 text-slate-400 hover:text-green-400 flex-1 min-w-0 h-8"
                  onClick={() => handleDownload(clip.filename)}
                >
                  <Download size={10} className="flex-shrink-0" />
                  <span className="ml-0.5 text-xs hidden xl:inline truncate">Get</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="p-1 text-slate-400 hover:text-red-400 flex-1 min-w-0 h-8"
                  onClick={() => handleDelete(clip.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 size={10} className="flex-shrink-0" />
                  <span className="ml-0.5 text-xs hidden xl:inline truncate">Del</span>
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Video Preview Modal */}
      {previewingClip && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-xl border border-slate-600 w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-600">
              <div>
                <h3 className="text-lg font-medium text-slate-50">{previewingClip.filename}</h3>
                <div className="flex items-center space-x-4 text-sm text-slate-400 mt-1">
                  <span>{formatDate(previewingClip.createdAt)}</span>
                  <span>{previewingClip.duration}s</span>
                  <span>{formatSize(previewingClip.fileSize)}</span>
                  <span className="text-blue-400">{previewingClip.triggerReason}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewingClip(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={20} />
              </Button>
            </div>

            {/* Video Player */}
            <div className="p-4">
              <video
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
                style={{ maxHeight: '70vh' }}
                src={`/clips/${previewingClip.filename}`}
              >
                Your browser does not support the video tag.
              </video>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 p-4 border-t border-slate-600">
              <Button
                variant="outline"
                onClick={() => handleDownload(previewingClip.filename)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600"
              >
                <Download size={16} className="mr-2" />
                Download
              </Button>
              {showActions && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleDelete(previewingClip.id);
                    setPreviewingClip(null);
                  }}
                  disabled={deleteMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Trash2 size={16} className="mr-2" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}