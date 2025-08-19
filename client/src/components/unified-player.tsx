
import { useState, useEffect } from 'react';

interface UnifiedPlayerProps {
  isVisible: boolean;
}

interface PlayerConfig {
  youtubeId: string;
  twitchChannel: string;
  kickChannel: string;
  twitchParent: string;
}

export default function UnifiedPlayer({ isVisible }: UnifiedPlayerProps) {
  const [platform, setPlatform] = useState<'youtube' | 'twitch' | 'kick'>('twitch');
  const [autoplay, setAutoplay] = useState(true);
  const [config, setConfig] = useState<PlayerConfig>({
    youtubeId: "r_ZH3UoxJn8",
    twitchChannel: "xqc",
    kickChannel: "kick_clipz",
    twitchParent: "www.example.com"
  });

  const [tempInputs, setTempInputs] = useState({
    youtubeId: config.youtubeId,
    twitchChannel: config.twitchChannel,
    kickChannel: config.kickChannel
  });

  const ytUrl = (id: string, autoplay: boolean) => {
    const ap = autoplay ? 1 : 0;
    const mute = autoplay ? 1 : 0;
    return `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=${ap}&mute=${mute}&playsinline=1&rel=0&modestbranding=1`;
  };

  const twitchUrl = (channel: string, parent: string, autoplay: boolean) => {
    const ap = autoplay ? "true" : "false";
    return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parent)}&autoplay=${ap}`;
  };

  const kickUrl = (channel: string) => {
    return `https://player.kick.com/${encodeURIComponent(channel)}`;
  };

  const getPlayerUrl = () => {
    switch (platform) {
      case 'youtube':
        return ytUrl(config.youtubeId, autoplay);
      case 'twitch':
        return twitchUrl(config.twitchChannel, config.twitchParent, autoplay);
      case 'kick':
        return kickUrl(config.kickChannel);
      default:
        return '';
    }
  };

  const handleApply = () => {
    setConfig({
      ...config,
      youtubeId: tempInputs.youtubeId.trim() || config.youtubeId,
      twitchChannel: tempInputs.twitchChannel.trim() || config.twitchChannel,
      kickChannel: tempInputs.kickChannel.trim() || config.kickChannel
    });
  };

  if (!isVisible) return null;

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center mb-3 p-3 bg-slate-700 rounded-lg">
        <div className="flex items-center gap-2">
          <label htmlFor="platform" className="text-sm text-slate-300">Platform:</label>
          <select
            id="platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as 'youtube' | 'twitch' | 'kick')}
            className="px-2 py-1 text-xs bg-slate-600 border border-slate-500 rounded text-slate-100"
          >
            <option value="youtube">YouTube</option>
            <option value="twitch">Twitch</option>
            <option value="kick">Kick</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="autoplay" className="text-sm text-slate-300">Autoplay</label>
          <input
            id="autoplay"
            type="checkbox"
            checked={autoplay}
            onChange={(e) => setAutoplay(e.target.checked)}
            className="w-4 h-4"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            placeholder="YouTube ID"
            value={tempInputs.youtubeId}
            onChange={(e) => setTempInputs({ ...tempInputs, youtubeId: e.target.value })}
            className="px-2 py-1 text-xs bg-slate-600 border border-slate-500 rounded text-slate-100 w-24"
          />
          <input
            placeholder="Twitch channel"
            value={tempInputs.twitchChannel}
            onChange={(e) => setTempInputs({ ...tempInputs, twitchChannel: e.target.value })}
            className="px-2 py-1 text-xs bg-slate-600 border border-slate-500 rounded text-slate-100 w-24"
          />
          <input
            placeholder="Kick channel"
            value={tempInputs.kickChannel}
            onChange={(e) => setTempInputs({ ...tempInputs, kickChannel: e.target.value })}
            className="px-2 py-1 text-xs bg-slate-600 border border-slate-500 rounded text-slate-100 w-24"
          />
          <button
            onClick={handleApply}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Player Frame */}
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-lg">
        <iframe
          src={getPlayerUrl()}
          title="Unified Player"
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      <div className="text-xs text-slate-400 mt-2">
        Twitch parent fixed to <code>www.example.com</code>. YouTube URL uses only the video ID.
      </div>
    </div>
  );
}
