
#!/usr/bin/env python3
"""
VLC-based live stream display module.
Displays live streams in a VLC media player window.
"""

import vlc
import time
import threading
import sys
import os

class VLCStreamDisplay:
    """VLC-based stream display with optimized live playback."""
    
    def __init__(self):
        """Initialize VLC instance with live streaming optimizations."""
        # VLC options for smooth live playback
        vlc_options = [
            '--network-caching=300',  # Low network cache for live streams
            '--file-caching=300',     # Low file cache
            '--live-caching=300',     # Low live cache
            '--sout-mux-caching=300', # Low mux cache
            '--clock-jitter=0',       # Reduce clock jitter
            '--network-synchronisation', # Network synchronization
            '--drop-late-frames',     # Drop late frames
            '--skip-frames',          # Skip frames if needed
            '--intf=dummy',           # No interface (we control it)
            '--no-video-title-show',  # Don't show filename on video
            '--no-osd',               # No on-screen display
        ]
        
        # Create VLC instance
        self.vlc_instance = vlc.Instance(vlc_options)
        self.media_player = self.vlc_instance.media_player_new()
        self.current_media = None
        self.is_playing = False
        
        print("🎬 VLC Stream Display initialized")
    
    def display_stream(self, stream_url: str, window_title: str = "Live Stream"):
        """
        Display a live stream in a VLC window.
        
        Args:
            stream_url: The streamlink-resolved HLS/m3u8 URL
            window_title: Title for the VLC window
        """
        try:
            print(f"🎥 Opening stream: {stream_url[:80]}...")
            
            # Create media from URL
            self.current_media = self.vlc_instance.media_new(stream_url)
            
            # Set media options for live streaming
            self.current_media.add_option(':network-caching=300')
            self.current_media.add_option(':live-caching=300')
            self.current_media.add_option(':clock-jitter=0')
            self.current_media.add_option(':drop-late-frames')
            
            # Set the media to the player
            self.media_player.set_media(self.current_media)
            
            # Set window title
            self.media_player.set_title(window_title)
            
            # Start playback
            play_result = self.media_player.play()
            
            if play_result == 0:  # Success
                self.is_playing = True
                print(f"✅ Stream started successfully in VLC window")
                print(f"   Title: {window_title}")
                print(f"   URL: {stream_url[:60]}...")
                return True
            else:
                print(f"❌ Failed to start VLC playback (code: {play_result})")
                return False
                
        except Exception as e:
            print(f"❌ Error displaying stream: {e}")
            return False
    
    def stop_stream(self):
        """Stop the current stream playback."""
        try:
            if self.is_playing:
                self.media_player.stop()
                self.is_playing = False
                print("⏹️ Stream playback stopped")
        except Exception as e:
            print(f"Error stopping stream: {e}")
    
    def is_stream_playing(self) -> bool:
        """Check if stream is currently playing."""
        try:
            state = self.media_player.get_state()
            return state == vlc.State.Playing
        except:
            return False
    
    def get_stream_info(self) -> dict:
        """Get current stream information."""
        try:
            if not self.current_media:
                return {}
            
            return {
                'is_playing': self.is_stream_playing(),
                'state': str(self.media_player.get_state()),
                'position': self.media_player.get_position(),
                'time': self.media_player.get_time(),
                'length': self.media_player.get_length(),
            }
        except Exception as e:
            print(f"Error getting stream info: {e}")
            return {}
    
    def cleanup(self):
        """Clean up VLC resources."""
        try:
            self.stop_stream()
            if self.media_player:
                self.media_player.release()
            if self.vlc_instance:
                self.vlc_instance.release()
            print("🧹 VLC resources cleaned up")
        except Exception as e:
            print(f"Error during VLC cleanup: {e}")

# Global VLC display instance
vlc_display = None

def display_stream(url: str, title: str = "Live Stream") -> bool:
    """
    Convenience function to display a stream using VLC.
    
    Args:
        url: Streamlink-resolved stream URL
        title: Window title for the VLC player
        
    Returns:
        bool: True if stream started successfully, False otherwise
    """
    global vlc_display
    
    try:
        # Initialize VLC display if not already done
        if vlc_display is None:
            vlc_display = VLCStreamDisplay()
        
        # Stop any existing stream
        vlc_display.stop_stream()
        
        # Start new stream
        return vlc_display.display_stream(url, title)
        
    except Exception as e:
        print(f"❌ Error in display_stream: {e}")
        return False

def stop_stream():
    """Stop the current VLC stream."""
    global vlc_display
    if vlc_display:
        vlc_display.stop_stream()

def get_stream_status() -> dict:
    """Get current VLC stream status."""
    global vlc_display
    if vlc_display:
        return vlc_display.get_stream_info()
    return {}

def cleanup_vlc():
    """Clean up VLC resources."""
    global vlc_display
    if vlc_display:
        vlc_display.cleanup()
        vlc_display = None

if __name__ == "__main__":
    """Test the VLC display with a sample stream."""
    if len(sys.argv) < 2:
        print("Usage: python vlc_display.py <stream_url>")
        sys.exit(1)
    
    stream_url = sys.argv[1]
    print(f"Testing VLC display with: {stream_url}")
    
    # Display stream
    if display_stream(stream_url, "Test Stream"):
        print("Stream started. Press Ctrl+C to stop...")
        try:
            # Keep the script running
            while True:
                status = get_stream_status()
                if status.get('is_playing'):
                    print(f"Playing... State: {status.get('state', 'Unknown')}")
                else:
                    print("Stream stopped or failed")
                    break
                time.sleep(5)
        except KeyboardInterrupt:
            print("\nStopping stream...")
            stop_stream()
            cleanup_vlc()
    else:
        print("Failed to start stream")
