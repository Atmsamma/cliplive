
# VLC Installation Instructions

This guide covers installing VLC media player and the python-vlc library for live stream display functionality.

## System Requirements

- VLC Media Player (system-wide installation)
- Python 3.7+ 
- python-vlc library

## Installation Steps

### 1. Install VLC Media Player

**For Replit (Linux environment):**
```bash
# Install VLC using the system package manager
sudo apt-get update
sudo apt-get install -y vlc

# Verify VLC installation
vlc --version
```

**For other Linux distributions:**
```bash
# Ubuntu/Debian
sudo apt-get install vlc

# CentOS/RHEL/Fedora
sudo yum install vlc
# or
sudo dnf install vlc

# Arch Linux
sudo pacman -S vlc
```

**For macOS:**
```bash
# Using Homebrew
brew install --cask vlc

# Or download from https://www.videolan.org/vlc/download-macosx.html
```

**For Windows:**
- Download VLC from: https://www.videolan.org/vlc/download-windows.html
- Run the installer and follow the setup wizard
- Ensure VLC is added to your system PATH

### 2. Install python-vlc Library

```bash
# Install using pip
pip install python-vlc

# Or using uvm (Replit's package manager)
uvm add python-vlc

# Verify installation
python -c "import vlc; print('VLC Python bindings installed successfully')"
```

### 3. Install Streamlink (if not already installed)

```bash
# Install Streamlink for stream URL resolution
pip install streamlink

# Verify installation
streamlink --version
```

## Usage Examples

### Basic Stream Display

```python
from backend.vlc_display import display_stream

# Display a Twitch stream
url = "https://m3u8-url-from-streamlink"
display_stream(url, "My Stream")
```

### Using the Standalone Viewer

```bash
# View a Twitch stream
python vlc_stream_viewer.py https://www.twitch.tv/papaplatte

# Specify quality
python vlc_stream_viewer.py https://www.twitch.tv/summit1g --quality 720p

# Custom window title
python vlc_stream_viewer.py https://www.twitch.tv/ninja --title "Ninja's Stream"
```

### Integration with Stream Processor

Add VLC display to your stream processor config:

```python
config = {
    "url": "https://www.twitch.tv/channel",
    "useVlcDisplay": True,  # Enable VLC display
    "clipLength": 30,
    # ... other config options
}
```

## Troubleshooting

### Common Issues

**1. "No module named 'vlc'"**
- Make sure python-vlc is installed: `pip install python-vlc`
- Verify Python can find the module: `python -c "import vlc"`

**2. "VLC media player not found"**
- Ensure VLC is installed system-wide
- Check VLC is in your PATH: `vlc --version`
- On Linux, try: `sudo apt-get install vlc`

**3. "Stream fails to play"**
- Verify the stream URL is valid
- Check your internet connection
- Try a different stream quality
- Ensure the stream is currently live

**4. "VLC window doesn't appear"**
- Check if you're running in a headless environment
- Ensure X11 forwarding is enabled if using SSH
- Try running with `--intf dummy` VLC option

### Performance Optimization

For better live stream performance, the VLC display uses:

- `--network-caching=300` - Low network cache (300ms)
- `--drop-late-frames` - Drop frames that arrive too late
- `--skip-frames` - Skip frames when necessary
- `--clock-jitter=0` - Reduce clock synchronization issues

### VLC Configuration

The VLC display automatically configures optimal settings for live streaming:

```python
vlc_options = [
    '--network-caching=300',  # Low latency
    '--live-caching=300',     # Live stream optimization
    '--drop-late-frames',     # Drop late frames
    '--skip-frames',          # Skip frames if needed
    '--no-video-title-show',  # Clean display
]
```

## Testing Installation

Run this test to verify everything is working:

```bash
# Test with a sample stream URL
python -c "
from backend.vlc_display import display_stream
import time

# Test URL (replace with actual stream URL)
test_url = 'https://your-test-stream-url.m3u8'
if display_stream(test_url, 'Test Stream'):
    print('VLC display working!')
    time.sleep(5)  # Display for 5 seconds
else:
    print('VLC display failed')
"
```

## Additional Resources

- [VLC Documentation](https://www.videolan.org/doc/)
- [python-vlc Documentation](https://python-vlc.readthedocs.io/)
- [Streamlink Documentation](https://streamlink.github.io/)
