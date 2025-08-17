#!/usr/bin/env python3
"""
HLS Ad Gatekeeper for Twitch streams.
Filters out streams containing ad markers before sending to clipper.
"""

import re
import subprocess
import time
import urllib.request
import urllib.error
from typing import Optional

# Regex pattern to detect ad markers in m3u8 playlists
AD_RE = re.compile(r"(twitch-stitched-ad|twitch-ad-quartile|EXT-X-DISCONTINUITY)", re.IGNORECASE)

class AdGatekeeper:
    """HLS Ad Gatekeeper for filtering clean Twitch streams."""

    def __init__(self, check_interval_sec: int = 2, max_retries: int = 30):
        """
        Initialize the Ad Gatekeeper.

        Args:
            check_interval_sec: Seconds to wait between checks
            max_retries: Maximum number of retries before giving up
        """
        self.check_interval_sec = check_interval_sec
        self.max_retries = max_retries

    def streamlink_url(self, channel: str, quality: str = "best") -> Optional[str]:
        """Get stream URL from streamlink."""
        cmd = [
            "streamlink", 
            "--stream-url", 
            f"https://www.twitch.tv/{channel}", 
            quality,
            "--retry-streams", "3",
            "--retry-max", "5"
        ]

        try:
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True, 
                timeout=30,
                stderr=subprocess.DEVNULL
            )

            if result.returncode == 0 and result.stdout.strip():
                url = result.stdout.strip()
                if url.startswith('http'):
                    return url
            return None

        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return None

    def fetch_playlist(self, url: str) -> Optional[str]:
        """Fetch m3u8 playlist content from URL."""
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                return response.read().decode("utf-8", "ignore")
        except (urllib.error.URLError, urllib.error.HTTPError, Exception):
            return None

    def has_ads(self, m3u8_text: str) -> bool:
        """Check if m3u8 playlist contains ad markers."""
        if not m3u8_text:
            return True  # Treat empty/invalid as "has ads" to be safe

        return bool(AD_RE.search(m3u8_text))

    def get_clean_twitch_url(self, channel: str, quality: str = "best") -> Optional[str]:
        """
        Get a clean Twitch HLS URL without ad markers.

        Args:
            channel: Twitch channel name (e.g., 'papaplatte')
            quality: Stream quality (default: 'best')

        Returns:
            Clean HLS URL or None if unable to get clean stream
        """
        print(f"🛡️ Ad Gatekeeper: Starting clean URL acquisition for {channel} ({quality})")

        retries = 0
        while retries < self.max_retries:
            try:
                # Get stream URL from streamlink
                url = self.streamlink_url(channel, quality)
                if not url:
                    print(f"⚠️ Ad Gatekeeper: No stream URL received (attempt {retries + 1}/{self.max_retries})")
                    retries += 1
                    time.sleep(self.check_interval_sec)
                    continue

                # Fetch playlist content
                playlist_content = self.fetch_playlist(url)
                if not playlist_content:
                    print(f"⚠️ Ad Gatekeeper: Failed to fetch playlist (attempt {retries + 1}/{self.max_retries})")
                    retries += 1
                    time.sleep(self.check_interval_sec)
                    continue

                # Check for ad markers
                if self.has_ads(playlist_content):
                    print(f"🚫 Ad Gatekeeper: Ad markers detected, retrying (attempt {retries + 1}/{self.max_retries})")
                    retries += 1
                    time.sleep(self.check_interval_sec)
                    continue

                # Clean URL found!
                print(f"✅ Ad Gatekeeper: Clean URL acquired after {retries + 1} attempts")
                return url

            except Exception as e:
                print(f"❌ Ad Gatekeeper: Error during attempt {retries + 1}: {e}")
                retries += 1
                time.sleep(self.check_interval_sec)

        print(f"❌ Ad Gatekeeper: Failed to get clean URL after {self.max_retries} attempts")
        return None

    def validate_url_continuously(self, channel: str, quality: str = "best", duration_sec: int = 60) -> bool:
        """
        Continuously validate that a stream remains clean for a given duration.
        Useful for ensuring stream stability before starting long captures.

        Args:
            channel: Twitch channel name
            quality: Stream quality
            duration_sec: How long to validate (seconds)

        Returns:
            True if stream remained clean for the duration
        """
        print(f"🔍 Ad Gatekeeper: Starting continuous validation for {duration_sec}s")

        start_time = time.time()
        checks = 0

        while (time.time() - start_time) < duration_sec:
            url = self.streamlink_url(channel, quality)
            if not url:
                print(f"⚠️ Ad Gatekeeper: Stream unavailable during validation")
                return False

            playlist_content = self.fetch_playlist(url)
            if not playlist_content or self.has_ads(playlist_content):
                print(f"🚫 Ad Gatekeeper: Ads detected during validation")
                return False

            checks += 1
            time.sleep(self.check_interval_sec)

        print(f"✅ Ad Gatekeeper: Stream remained clean for {duration_sec}s ({checks} checks)")
        return True

def main():
    """CLI entry point for ad gatekeeper."""
    import sys

    if len(sys.argv) < 2:
        print("Usage: python ad_gatekeeper.py <channel> [quality] [duration_sec]", file=sys.stderr)
        print("Example: python ad_gatekeeper.py papaplatte best", file=sys.stderr)
        sys.exit(1)

    channel = sys.argv[1]
    quality = sys.argv[2] if len(sys.argv) > 2 else "best"
    duration = int(sys.argv[3]) if len(sys.argv) > 3 else 60

    gatekeeper = AdGatekeeper()

    # Get clean URL
    clean_url = gatekeeper.get_clean_twitch_url(channel, quality)
    if not clean_url:
        print(f"❌ Failed to get clean URL for {channel}")
        sys.exit(1)

    print(f"✅ Clean URL: {clean_url}")

    # Optionally validate for stability
    if duration > 0:
        is_stable = gatekeeper.validate_url_continuously(channel, quality, duration)
        if not is_stable:
            print(f"❌ Stream was not stable during {duration}s validation")
            sys.exit(1)
        print(f"✅ Stream validated as stable for {duration}s")

if __name__ == "__main__":
    main()