
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export function useHlsPlayer(hlsUrl?: string) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!hlsUrl || !videoRef.current) return;

    // Safari can play HLS natively
    const video = videoRef.current;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.play().catch(() => {});
      return;
    }

    // Other browsers: use hls.js
    if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDuration: 1,
        maxLiveSyncPlaybackRate: 1.5,
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data?.fatal) setError("Playback error. Please Retry.");
      });

      video.play().catch(() => {});

      return () => {
        hls.destroy();
      };
    } else {
      setError("HLS not supported in this browser.");
    }
  }, [hlsUrl]);

  return { videoRef, error };
}
