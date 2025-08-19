import ReactPlayer from 'react-player';
import { useState, useEffect, useRef } from 'react';

interface LivePlayerProps {
  streamUrl: string;
  onError?: (error: any) => void;
}

export default function LivePlayer({ streamUrl, onError }: LivePlayerProps) {
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const playerRef = useRef<ReactPlayer>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleError = (error: any) => {
    console.error('LivePlayer error:', error);

    // Check if it's a recoverable error
    if (error?.message?.includes('interrupted') || 
        error?.message?.includes('removed from the document') ||
        error?.target?.error?.code === 4) { // MEDIA_ELEMENT_ERROR: Format error

      console.log('Attempting to recover from stream interruption...');
      setIsReconnecting(true);

      // Clear any existing timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Attempt to reconnect after a short delay
      reconnectTimeoutRef.current = setTimeout(() => {
        setIsReconnecting(false);
        setPlayerError(null);

        // Force player refresh
        if (playerRef.current) {
          playerRef.current.seekTo(0);
        }
      }, 2000);

    } else {
      setPlayerError('Stream playback failed');
      onError?.(error);
    }
  };

  const handleReady = () => {
    console.log('Player ready');
    setPlayerError(null);
    setIsReconnecting(false);
  };

  const handleStart = () => {
    console.log('Player started');
    setPlayerError(null);
    setIsReconnecting(false);
  };

  const handleBuffer = () => {
    console.log('Player buffering...');
  };

  const handleBufferEnd = () => {
    console.log('Player buffer ended');
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  if (playerError) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-700 rounded-lg">
        <div className="text-center text-red-400">
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-sm mb-2">{playerError}</div>
          <button 
            onClick={() => setPlayerError(null)}
            className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-xs"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isReconnecting) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-700 rounded-lg">
        <div className="text-center text-yellow-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mx-auto mb-2"></div>
          <div className="text-sm">Reconnecting to stream...</div>
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
    <div className="w-full h-full bg-black rounded-lg overflow-hidden">
      <ReactPlayer
        ref={playerRef}
        url={streamUrl}
        playing={true}
        muted={true}
        width="100%"
        height="100%"
        onError={handleError}
        onReady={handleReady}
        onStart={handleStart}
        onBuffer={handleBuffer}
        onBufferEnd={handleBufferEnd}
        config={{
          file: {
            forceHLS: true,
            hlsOptions: {
              enableWorker: false,
              lowLatencyMode: true,
              backBufferLength: 30,
              maxBufferLength: 60,
              startLevel: -1,
              autoStartLoad: true,
              debug: false,
            },
          },
        }}
        style={{
          pointerEvents: 'none', // Prevent user interaction that might cause interruptions
        }}
      />
    </div>
  );
}