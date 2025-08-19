
#!/usr/bin/env python3
"""
Standalone VLC Stream Viewer
Uses Streamlink + VLC to display live streams in a window.
"""

import sys
import time
import subprocess
import argparse
from backend.vlc_display import display_stream, stop_stream, cleanup_vlc, get_stream_status

def get_stream_url_with_streamlink(url: str, quality: str = "best") -> str:
    """
    Use Streamlink to resolve the actual stream URL.
    
    Args:
        url: Original stream URL (e.g., https://www.twitch.tv/channel)
        quality: Stream quality (best, worst, 720p, etc.)
        
    Returns:
        str: Resolved HLS/m3u8 URL or None if failed
    """
    try:
        print(f"🔗 Resolving stream URL with Streamlink...")
        print(f"   Source: {url}")
        print(f"   Quality: {quality}")
        
        # Run streamlink to get the actual stream URL
        cmd = [
            'streamlink',
            url,
            quality,
            '--stream-url',
            '--retry-streams', '3',
            '--retry-max', '5'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            stream_url = result.stdout.strip()
            if stream_url and stream_url.startswith('http'):
                print(f"✅ Stream URL resolved: {stream_url[:60]}...")
                return stream_url
            else:
                print(f"❌ Invalid stream URL received: '{stream_url}'")
                return None
        else:
            print(f"❌ Streamlink failed:")
            print(f"   Return code: {result.returncode}")
            print(f"   Error: {result.stderr}")
            return None
            
    except subprocess.TimeoutExpired:
        print("❌ Streamlink timed out")
        return None
    except Exception as e:
        print(f"❌ Error running Streamlink: {e}")
        return None

def main():
    """Main VLC stream viewer application."""
    parser = argparse.ArgumentParser(
        description="Display live streams using Streamlink + VLC",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python vlc_stream_viewer.py https://www.twitch.tv/papaplatte
  python vlc_stream_viewer.py https://www.twitch.tv/summit1g --quality 720p
  python vlc_stream_viewer.py "https://www.youtube.com/watch?v=VIDEO_ID" --quality worst
        """
    )
    
    parser.add_argument(
        "url",
        help="Stream URL (Twitch, YouTube, etc.)"
    )
    
    parser.add_argument(
        "--quality",
        default="best",
        help="Stream quality (default: best, options: best, worst, 720p, 480p, etc.)"
    )
    
    parser.add_argument(
        "--title",
        help="Custom window title (default: auto-generated)"
    )
    
    args = parser.parse_args()
    
    print(f"🎬 VLC Stream Viewer")
    print(f"   URL: {args.url}")
    print(f"   Quality: {args.quality}")
    
    try:
        # Step 1: Resolve stream URL with Streamlink
        stream_url = get_stream_url_with_streamlink(args.url, args.quality)
        
        if not stream_url:
            print("❌ Failed to resolve stream URL")
            sys.exit(1)
        
        # Step 2: Generate window title
        window_title = args.title
        if not window_title:
            # Extract channel/video name from URL
            if 'twitch.tv/' in args.url:
                try:
                    channel = args.url.split('twitch.tv/')[-1].split('/')[0].split('?')[0]
                    window_title = f"Twitch - {channel}"
                except:
                    window_title = "Twitch Stream"
            elif 'youtube.com' in args.url:
                window_title = "YouTube Stream"
            else:
                window_title = "Live Stream"
        
        print(f"🪟 Window title: {window_title}")
        
        # Step 3: Start VLC display
        print(f"🎥 Starting VLC display...")
        
        if display_stream(stream_url, window_title):
            print(f"✅ Stream started successfully!")
            print(f"   Close the VLC window or press Ctrl+C to stop")
            
            # Keep the script running and monitor stream status
            try:
                last_status = None
                while True:
                    status = get_stream_status()
                    
                    # Only print status changes to avoid spam
                    current_status = status.get('is_playing', False)
                    if current_status != last_status:
                        if current_status:
                            print(f"▶️  Stream playing: {status.get('state', 'Unknown')}")
                        else:
                            print(f"⏸️  Stream paused/stopped")
                        last_status = current_status
                    
                    # If stream stops playing, break the loop
                    if not current_status and last_status is not None:
                        print("📺 Stream ended or VLC window closed")
                        break
                        
                    time.sleep(2)
                    
            except KeyboardInterrupt:
                print(f"\n⏹️  Stopping stream...")
                
        else:
            print(f"❌ Failed to start VLC display")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)
        
    finally:
        # Clean up VLC resources
        print(f"🧹 Cleaning up...")
        stop_stream()
        cleanup_vlc()
        print(f"✅ Done")

if __name__ == "__main__":
    main()
