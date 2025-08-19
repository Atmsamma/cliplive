
import { useState, useEffect } from "react";
import ReactPlayer from "react-player";

interface LivePlayerProps {
  streamUrl: string;
  onError?: (error: any) => void;
}

export default function LivePlayer({ streamUrl, onError }: LivePlayerProps) {
  const [playerKey, setPlayerKey] = useState(0);

  // Force player remount when URL changes to handle HLS stream switches
  useEffect(() => {
    if (streamUrl) {
      setPlayerKey(prev => prev + 1);
    }
  }, [streamUrl]);

  const handleError = (error: any) => {
    console.error('LivePlayer Error:', error);
    onError?.(error);
  };

  const handleReady = () => {
    console.log('Player ready');
  };

  const handleStart = () => {
    console.log('Player started');
  };

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
    <ReactPlayer
      key={playerKey}
      url={streamUrl}
      playing
      controls
      config={{ 
        file: { 
          forceHLS: true,
          hlsOptions: {
            enableWorker: false,
            lowLatencyMode: true,
            backBufferLength: 90
          }
        }
      }}
      width="100%"
      height="100%"
      onError={handleError}
      onReady={handleReady}
      onStart={handleStart}
    />
  );
}
