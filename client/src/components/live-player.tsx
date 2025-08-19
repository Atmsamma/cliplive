import { useState } from 'react';

interface LivePlayerProps {
  streamUrl: string;
  onError?: (error: any) => void;
}

export default function LivePlayer({ streamUrl, onError }: LivePlayerProps) {
  const [playerError, setPlayerError] = useState<string | null>(null);

  if (playerError) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-700 rounded-lg">
        <div className="text-center text-red-400 max-w-sm px-4">
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-sm mb-2">{playerError}</div>
          <button 
            onClick={() => {
              setPlayerError(null);
            }}
            className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-xs"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!streamUrl) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-700 rounded-lg">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
          <div>Loading stream...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full bg-slate-700 rounded-lg">
      <div className="text-center text-slate-400">
        <div className="text-4xl mb-2">📺</div>
        <div>Stream URL Available</div>
        <div className="text-xs text-slate-300 mt-2 max-w-md truncate">
          {streamUrl}
        </div>
      </div>
    </div>
  );
}