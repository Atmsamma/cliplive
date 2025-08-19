
import React from 'react';

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
        return (
          <div className={`w-full h-full ${className}`}>
            <div id={`twitch-embed-${channelOrVideo}`} className="w-full h-full"></div>
            <script 
              src="https://player.twitch.tv/js/embed/v1.js"
              onLoad={() => {
                // @ts-ignore
                if (window.Twitch) {
                  // @ts-ignore
                  new window.Twitch.Player(`twitch-embed-${channelOrVideo}`, {
                    channel: channelOrVideo,
                    width: "100%",
                    height: "100%",
                    parent: [window.location.hostname]
                  });
                }
              }}
            />
          </div>
        );

      case 'youtube':
        return (
          <div className={`w-full h-full ${className}`}>
            <iframe 
              width="100%" 
              height="100%" 
              src={`https://www.youtube.com/embed/${channelOrVideo}`}
              title="YouTube video player" 
              frameBorder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
              referrerPolicy="strict-origin-when-cross-origin" 
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        );

      case 'kick':
        return (
          <div className={`w-full h-full ${className}`}>
            <iframe 
              src={`https://player.kick.com/${channelOrVideo}`}
              width="100%" 
              height="100%" 
              frameBorder="0" 
              scrolling="no" 
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        );

      default:
        return (
          <div className={`w-full h-full ${className}`}>
            <iframe 
              src={streamUrl}
              width="100%" 
              height="100%" 
              frameBorder="0" 
              allowFullScreen
              className="w-full h-full"
              title="Generic stream player"
            />
          </div>
        );
    }
  };

  return (
    <div className="w-full h-full grid grid-cols-1 gap-5">
      <div className="w-full aspect-video">
        {renderPlayer()}
      </div>
      <div className="text-center text-sm text-slate-400">
        Platform: {platform.charAt(0).toUpperCase() + platform.slice(1)}
        {channelOrVideo && ` • ${channelOrVideo}`}
      </div>
    </div>
  );
}
