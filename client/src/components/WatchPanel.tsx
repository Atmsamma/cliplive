
import React, { useEffect, useState } from "react";
import { resolveStream } from "../api/streams";
import { useHlsPlayer } from "../hooks/useHlsPlayer";
import { Button } from "@/components/ui/button";

type Props = {
  sourceUrl?: string; // e.g. "https://twitch.tv/somechannel"
};

export default function WatchPanel({ sourceUrl }: Props) {
  const [hlsUrl, setHlsUrl] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"idle"|"resolving"|"ready"|"error">("idle");
  const [message, setMessage] = useState<string>("Ready to Clip Live");

  const { videoRef, error } = useHlsPlayer(hlsUrl);

  useEffect(() => {
    if (!sourceUrl) {
      setStatus("idle");
      setMessage("Ready to Clip Live");
      setHlsUrl(undefined);
      return;
    }

    let cancelled = false;

    async function go() {
      setStatus("resolving");
      setMessage("Fetching stream…");
      try {
        const playback = await resolveStream(sourceUrl);
        if (!cancelled) {
          setHlsUrl(playback);
          setStatus("ready");
          setMessage("Watching");
        }
      } catch (e: any) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Failed to load stream");
        }
      }
    }

    go();
    return () => { cancelled = true; };
  }, [sourceUrl]);

  const handleRetry = () => {
    if (sourceUrl) {
      setHlsUrl(undefined);
      setMessage("Retrying…");
      setStatus("resolving");
    }
  };

  return (
    <div className="w-full h-full rounded-xl border border-slate-700 bg-slate-900 p-4 flex flex-col">
      <div className="text-rose-400 text-xl font-semibold mb-2">
        {message}
      </div>

      {(status === "error" || error) && (
        <div className="text-red-400 mb-4">
          Stream may be offline or URL invalid.
          <Button
            className="mt-3 px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
            onClick={handleRetry}
            variant="outline"
            size="sm"
          >
            Retry
          </Button>
        </div>
      )}

      {/* The actual video area */}
      <div className="mt-2 flex-1">
        {status === "ready" && hlsUrl ? (
          <video
            ref={videoRef}
            className="w-full h-full bg-black rounded-lg"
            controls
            autoPlay
            muted
            playsInline
          />
        ) : (
          <div className="w-full h-full bg-black rounded-lg flex items-center justify-center">
            <div className="text-center">
              {status === "resolving" ? (
                <>
                  <div className="text-4xl mb-2">🔄</div>
                  <div className="text-lg text-slate-400">Loading stream...</div>
                </>
              ) : status === "error" ? (
                <>
                  <div className="text-4xl mb-2">❌</div>
                  <div className="text-lg text-slate-400">Stream unavailable</div>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-2">⏸️</div>
                  <div className="text-lg text-slate-400">No Stream</div>
                  <div className="text-sm text-slate-500 mt-2">Enter a URL and click Start Clipping</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
