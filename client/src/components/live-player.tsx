
import { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface LivePlayerProps {
  streamUrl: string;
  onError?: (error: any) => void;
}

export default function LivePlayer({ streamUrl, onError }: LivePlayerProps) {
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleError = (error: any) => {
    console.error('LivePlayer error:', error);
    setPlayerError('Stream playback failed');
    onError?.(error);
  };

  const testStreamConnectivity = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        mode: 'no-cors' // Avoid CORS issues
      });
      return true;
    } catch (error) {
      console.error('Stream connectivity test failed:', error);
      return false;
    }
  };

  const initializeHls = async () => {
    if (!videoRef.current || !streamUrl) return;

    // Test connectivity first
    console.log('Testing stream connectivity...');
    const isConnectable = await testStreamConnectivity(streamUrl);
    if (!isConnectable) {
      console.warn('Stream connectivity test failed, but attempting anyway...');
    }

    // Destroy existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: false, // Disable for better compatibility
        backBufferLength: 10,
        maxBufferLength: 30,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 5,
        autoStartLoad: true,
        debug: true, // Enable debug for troubleshooting
        xhrSetup: (xhr, url) => {
          // Add headers to avoid detection
          xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        },
        fetchSetup: (context, initParams) => {
          // Add headers for fetch requests
          return new Request(context.url, {
            ...initParams,
            headers: {
              ...initParams.headers,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
        }
      });

      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest parsed, starting playback');
        video.muted = true;
        video.play().catch(err => {
          console.warn('Autoplay failed:', err);
        });
        setPlayerError(null);
        setIsReconnecting(false);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data);
        
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.details === 'manifestLoadError') {
                console.error('Cannot load stream manifest - likely network/geographic restriction');
                setPlayerError('Stream not accessible from this location');
              } else {
                console.log('Network error, attempting to recover...');
                setIsReconnecting(true);
                setTimeout(() => {
                  if (hlsRef.current) {
                    hlsRef.current.startLoad();
                  }
                }, 2000);
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error, attempting to recover...');
              setIsReconnecting(true);
              setTimeout(() => {
                if (hlsRef.current) {
                  hlsRef.current.recoverMediaError();
                }
              }, 1000);
              break;
            default:
              console.log('Fatal error, destroying HLS instance');
              handleError(data);
              break;
          }
        } else {
          // Non-fatal errors
          console.warn('Non-fatal HLS error:', data);
        }
      });

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = streamUrl;
      video.muted = true;
      video.play().catch(err => {
        console.warn('Autoplay failed:', err);
      });
      setPlayerError(null);
      setIsReconnecting(false);
    } else {
      setPlayerError('HLS not supported in this browser');
    }
  };

  // Initialize HLS when stream URL changes
  useEffect(() => {
    if (streamUrl) {
      console.log('Initializing HLS with URL:', streamUrl.substring(0, 80) + '...');
      initializeHls();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  if (playerError) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-700 rounded-lg">
        <div className="text-center text-red-400 max-w-sm px-4">
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-sm mb-2">{playerError}</div>
          {playerError.includes('not accessible') && (
            <div className="text-xs text-slate-400 mb-3">
              This may be due to geographic restrictions or network filtering. 
              Try a different stream or check your network connection.
            </div>
          )}
          <button 
            onClick={() => {
              setPlayerError(null);
              setIsReconnecting(false);
              initializeHls();
            }}
            className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-white text-xs"
          >
            Retry Connection
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
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        muted
        playsInline
        controls={false}
        onLoadStart={() => console.log('Video load started')}
        onCanPlay={() => console.log('Video can play')}
        onPlaying={() => console.log('Video playing')}
        onError={(e) => {
          console.error('Video element error:', e);
          handleError(e);
        }}
      />
    </div>
  );
}
