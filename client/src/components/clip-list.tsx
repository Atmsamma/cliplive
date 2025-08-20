
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { streamService } from "@/lib/stream-service";
import type { Clip } from "@shared/schema";

interface ClipListProps {
  sessionId: string;
}

export default function ClipList({ sessionId }: ClipListProps) {
  const { data: clips, isLoading, error, refetch } = useQuery<Clip[]>({
    queryKey: ["/api/clips", sessionId],
    queryFn: () => streamService.getSessionClips(),
    refetchInterval: 2000,
  });

  // Listen for new clips
  React.useEffect(() => {
    const handleSSEEvent = (event: CustomEvent) => {
      const { type } = event.detail;
      if (type === 'clip-generated') {
        refetch();
      }
    };

    window.addEventListener('sse-event', handleSSEEvent as EventListener);
    return () => window.removeEventListener('sse-event', handleSSEEvent as EventListener);
  }, [refetch]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString();
  };

  const getClipUrl = (filename: string) => {
    return `/clips/${sessionId}/${filename}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generated Clips</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loading clips...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Generated Clips</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600">Error loading clips</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated Clips</CardTitle>
        <CardDescription>
          Session clips ({clips?.length || 0} total)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {clips && clips.length > 0 ? (
          <div className="space-y-4">
            {clips.map((clip) => (
              <div
                key={clip.id}
                className="border rounded-lg p-4 space-y-2"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">{clip.filename}</h3>
                    <p className="text-sm text-gray-600">
                      {formatDate(clip.createdAt)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {clip.triggerReason}
                  </Badge>
                </div>
                
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>{formatFileSize(clip.fileSize)}</span>
                  <span>{clip.duration}s</span>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => window.open(getClipUrl(clip.filename), '_blank')}
                  >
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const video = document.createElement('video');
                      video.src = getClipUrl(clip.filename);
                      video.controls = true;
                      video.style.maxWidth = '100%';
                      const popup = window.open('', '_blank', 'width=800,height=600');
                      if (popup) {
                        popup.document.body.appendChild(video);
                        popup.document.title = clip.filename;
                      }
                    }}
                  >
                    Preview
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 text-center py-8">
            No clips generated yet. Start capturing to see clips here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
