
#!/usr/bin/env python3
"""
CLI wrapper for Ad Gatekeeper + Stream Clipper integration.
Usage: python gatekeep_and_clip.py --channel <name> [--quality best] [--duration 60]
"""

import argparse
import sys
import os
import subprocess
import json

# Ensure stdout/stderr can emit UTF-8 (emoji) without crashing on Windows code pages
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
from backend.ad_gatekeeper import AdGatekeeper

def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Gatekeep and clip Twitch streams without ads",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python gatekeep_and_clip.py --channel papaplatte
  python gatekeep_and_clip.py --channel summit1g --quality 720p --duration 120
  python gatekeep_and_clip.py --channel ninja --quality best --clip-length 30
        """
    )
    
    parser.add_argument(
        "--channel", 
        help="Twitch channel name (e.g., papaplatte)"
    )
    
    parser.add_argument(
        "--quality", 
        default="best", 
        help="Stream quality (default: best)"
    )
    
    parser.add_argument(
        "--duration", 
        type=int, 
        default=60, 
        help="Duration to validate stream stability in seconds (default: 60)"
    )
    
    parser.add_argument(
        "--clip-length", 
        type=int, 
        default=20, 
        help="Length of clips to generate in seconds (default: 20)"
    )
    
    parser.add_argument(
        "--audio-threshold", 
        type=int, 
        default=6, 
        help="Audio threshold for highlight detection (default: 6)"
    )
    
    parser.add_argument(
        "--motion-threshold", 
        type=int, 
        default=30, 
        help="Motion threshold for highlight detection (default: 30)"
    )
    
    parser.add_argument(
        "--validate-only", 
        action="store_true", 
        help="Only validate stream cleanliness, don't start clipper"
    )
    
    parser.add_argument(
        "--url",
        help="Stream URL to process (alternative to --channel)"
    )
    
    parser.add_argument(
        "--output-dir",
        help="Output directory for clips"
    )
    
    parser.add_argument(
        "--session-id",
        help="Session ID for API integration"
    )
    
    args = parser.parse_args()
    
    # Handle both channel-based and URL-based workflows
    if args.url:
        # URL-based workflow (called from session manager)
        print(f"🚀 Starting stream processor for URL: {args.url}")
        if args.session_id:
            print(f"   Session ID: {args.session_id}")
        
        # Skip ad gatekeeper for direct URL processing
        processor_config = {
            "url": args.url,
            "audioThreshold": args.audio_threshold,
            "motionThreshold": args.motion_threshold,
            "clipLength": args.clip_length,
            "sessionId": args.session_id,  # Pass session ID to processor
            "outputDir": args.output_dir  # Pass output directory
        }
        
        try:
            # Start the stream processor directly
            print(f"🚀 Launching stream processor...")
            print(f"   URL: {args.url}")
            print(f"   Audio Threshold: {args.audio_threshold}")
            print(f"   Motion Threshold: {args.motion_threshold}")
            print(f"   Clip Length: {args.clip_length}s")
            
            # Run the stream processor
            # Use current interpreter for portability (Windows has no python3 alias)
            cmd = [
                sys.executable,
                "backend/stream_processor.py",
                json.dumps(processor_config)
            ]
            
            print(f"🎯 Command: {' '.join(cmd[:2])} [config]")
            subprocess.run(cmd, check=True)
            
        except subprocess.CalledProcessError as e:
            print(f"❌ Stream processor failed: {e}")
            sys.exit(1)
        except KeyboardInterrupt:
            print(f"\n⏹️ Stream processing interrupted by user")
            sys.exit(0)
            
        return
    
    # Channel-based workflow (original logic)
    if not args.channel:
        print("❌ Either --channel or --url must be provided")
        sys.exit(1)
        
    print(f"🛡️ Starting Ad Gatekeeper for channel: {args.channel}")
    print(f"   Quality: {args.quality}")
    print(f"   Validation Duration: {args.duration}s")
    
    # Initialize Ad Gatekeeper
    gatekeeper = AdGatekeeper()
    
    # Step 1: Get clean URL
    print(f"🔍 Step 1: Getting clean stream URL...")
    clean_url = gatekeeper.get_clean_twitch_url(args.channel, args.quality)
    
    if not clean_url:
        print(f"❌ Failed to get clean URL for channel {args.channel}")
        print(f"   Possible reasons:")
        print(f"   - Channel is offline")
        print(f"   - Stream has persistent ads")
        print(f"   - Network connectivity issues")
        sys.exit(1)
    
    print(f"✅ Clean URL acquired: {clean_url[:80]}...")
    
    # Step 2: Validate stream stability
    if args.duration > 0:
        print(f"🔍 Step 2: Validating stream stability for {args.duration}s...")
        is_stable = gatekeeper.validate_url_continuously(
            args.channel, 
            args.quality, 
            args.duration
        )
        
        if not is_stable:
            print(f"❌ Stream validation failed - stream had ads during validation period")
            sys.exit(1)
        
        print(f"✅ Stream validated as stable and ad-free")
    
    # If only validating, exit here
    if args.validate_only:
        print(f"✅ Validation complete - stream is clean and ready for clipping")
        sys.exit(0)
    
    # Step 3: Start stream processor with clean URL
    print(f"🎬 Step 3: Starting stream processor...")
    
    # Construct the Twitch URL for the stream processor
    stream_url = f"https://www.twitch.tv/{args.channel}"
    
    # Configure stream processor
    processor_config = {
        "url": stream_url,
        "audioThreshold": args.audio_threshold,
        "motionThreshold": args.motion_threshold,
        "clipLength": args.clip_length,
        "useAdGatekeeper": True,  # Enable Ad Gatekeeper in processor
        "sessionId": args.session_id,  # Pass session ID if provided
        "outputDir": args.output_dir   # Pass output directory if provided
    }
    
    try:
        # Start the stream processor
        print(f"🚀 Launching stream processor with Ad Gatekeeper protection...")
        print(f"   URL: {stream_url}")
        print(f"   Audio Threshold: {args.audio_threshold}")
        print(f"   Motion Threshold: {args.motion_threshold}")
        print(f"   Clip Length: {args.clip_length}s")
        
        # Run the stream processor
        cmd = [
            sys.executable,
            "backend/stream_processor.py",
            json.dumps(processor_config)
        ]
        
        print(f"🎯 Command: {' '.join(cmd)}")
        subprocess.run(cmd, check=True)
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Stream processor failed: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print(f"\n⏹️ Stream processing interrupted by user")
        sys.exit(0)

if __name__ == "__main__":
    main()
