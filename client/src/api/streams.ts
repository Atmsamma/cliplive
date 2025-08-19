
export async function resolveStream(sourceUrl: string): Promise<string> {
  const res = await fetch("/api/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_url: sourceUrl }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to resolve stream");
  }

  const data = await res.json();
  return data.playback_url; // the .m3u8 URL
}
