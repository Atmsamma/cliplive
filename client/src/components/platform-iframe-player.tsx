
import React, { useEffect, useRef } from 'react';

interface TwitchEmbedProps {
  channel: string;
}

function TwitchEmbed({ channel }: TwitchEmbedProps) {
  const embedRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    // Set the ID for the Twitch embed
    const embedId = "twitch-embed";
    if (embedRef.current) {
      embedRef.current.id = embedId;
    }

    // Function to initialize Twitch player
    const initializeTwitchPlayer = () => {
      if (window.Twitch && embedRef.current) {
        try {
          // Destroy existing player if any
          if (playerRef.current) {
            playerRef.current.destroy();
          }
          
          // Create a Twitch.Player object exactly as specified
          playerRef.current = new window.Twitch.Player(embedId, {
            channel: channel
          });
        } catch (error) {
          console.error('Error initializing Twitch player:', error);
        }
      }
    };

    // Check if Twitch script is already loaded
    if (window.Twitch) {
      initializeTwitchPlayer();
    } else {
      // Load the Twitch embed script if not already loaded
      const existingScript = document.querySelector('script[src="https://player.twitch.tv/js/embed/v1.js"]');
      
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://player.twitch.tv/js/embed/v1.js';
        script.async = true;
        script.onload = initializeTwitchPlayer;
        document.head.appendChild(script);
      } else {
        // Script exists, wait for it to load
        const checkTwitch = setInterval(() => {
          if (window.Twitch) {
            clearInterval(checkTwitch);
            initializeTwitchPlayer();
          }
        }, 100);
      }
    }

    // Cleanup function
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (error) {
          console.error('Error destroying Twitch player:', error);
        }
      }
    };
  }, [channel]);

  // Add a placeholder for the Twitch embed
  return <div ref={embedRef} id="twitch-embed" className="w-full h-full" />;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    Twitch: any;
  }
}

interface PlatformIframePlayerProps {
  streamUrl: string;
  className?: string;
}

export default function PlatformIframePlayer({ streamUrl, className = "" }: PlatformIframePlayerProps) {
  const detectPlatform = (url: string) => {
    if (url.includes('twitch.tv')) return 'twitch';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('kick.com')) return 'kick';
    return 'generic';
  };

  const extractChannelOrVideo = (url: string, platform: string) => {
    switch (platform) {
      case 'twitch':
        // Extract channel from URLs like https://www.twitch.tv/<channel>
        const twitchMatch = url.match(/twitch\.tv\/([^\/\?]+)/);
        return twitchMatch ? twitchMatch[1] : '';
      
      case 'youtube':
        const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
        return youtubeMatch ? youtubeMatch[1] : '';
      
      case 'kick':
        const kickMatch = url.match(/kick\.com\/([^\/\?]+)/);
        return kickMatch ? kickMatch[1] : '';
      
      default:
        return '';
    }
  };

  const platform = detectPlatform(streamUrl);
  const channelOrVideo = extractChannelOrVideo(streamUrl, platform);

  const renderPlayer = () => {
    switch (platform) {
      case 'twitch':
        return <TwitchEmbed channel={channelOrVideo} />;

      case 'youtube':
        return (
          <iframe 
            width="100%" 
            height="100%" 
            src={`https://www.youtube.com/embed/${channelOrVideo}`}
            title="YouTube video player" 
            frameBorder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            referrerPolicy="strict-origin-when-cross-origin" 
            allowFullScreen
            className="w-full h-full rounded-lg"
          />
        );

      case 'kick':
        return (
          <iframe 
            src={`https://player.kick.com/${channelOrVideo}`}
            width="100%" 
            height="100%" 
            frameBorder="0" 
            scrolling="no" 
            allowFullScreen
            className="w-full h-full rounded-lg"
          />
        );

      default:
        return (
          <iframe 
            src={streamUrl}
            width="100%" 
            height="100%" 
            frameBorder="0" 
            allowFullScreen
            className="w-full h-full rounded-lg"
            title="Generic stream player"
          />
        );
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 w-full">
        {renderPlayer()}
      </div>
      <div className="text-center text-xs text-slate-400 mt-2 py-1">
        Platform: {platform.charAt(0).toUpperCase() + platform.slice(1)}
        {channelOrVideo && ` • ${channelOrVideo}`}
      </div>
    </div>
  );
}
