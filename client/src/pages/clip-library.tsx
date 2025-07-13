import { useQuery } from "@tanstack/react-query";
import ClipList from "@/components/clip-list";
import { Film } from "lucide-react";

export default function ClipLibrary() {
  const { data: clips = [], isLoading } = useQuery({
    queryKey: ["/api/clips"],
    refetchInterval: 5000,
  });

  const totalSize = clips.reduce((acc: number, clip: any) => acc + clip.fileSize, 0);
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
            <h2 className="text-xl font-semibold text-slate-50">Clip Library</h2>
            <p className="text-slate-400 text-sm">Manage and download your captured highlights</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-slate-400">Total: {clips.length} clips</span>
            <div className="text-sm text-slate-400">•</div>
            <span className="text-sm text-slate-400">{formatSize(totalSize)}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-6">
        <div className="bg-slate-800 rounded-xl border border-slate-600 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium flex items-center space-x-2 text-slate-50">
              <Film className="text-purple-400" size={20} />
              <span>All Clips</span>
            </h3>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-slate-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-400 mx-auto mb-4"></div>
              <p>Loading clips...</p>
            </div>
          ) : (
            <ClipList clips={clips} showActions />
          )}
        </div>
      </main>
    </>
  );
}
