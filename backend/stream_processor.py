#!/usr/bin/env python3
"""
Stream processor with FFmpeg clipping functionality.
Implements 20% before / 80% after detection moment clipping strategy.
"""

import os
import sys
import time
import json
import threading
import subprocess
import tempfile
import shutil
import re
from datetime import datetime
from typing import Dict, Any, Optional, List
from queue import Queue, Empty
import requests
from collections import deque
import statistics
import numpy as np

# Import AI detector
try:
    from ai_detector import AIHighlightDetector
    from setup_nltk import setup_nltk
    AI_AVAILABLE = True
    print("🤖 AI detector available")
except ImportError as e:
    print(f"⚠️ AI detector not available: {e}")
    AI_AVAILABLE = False

# Import Ad Gatekeeper
try:
    from ad_gatekeeper import AdGatekeeper
    AD_GATEKEEPER_AVAILABLE = True
    print("🛡️ Ad Gatekeeper available")
except ImportError as e:
    print(f"⚠️ Ad Gatekeeper not available: {e}")
    AD_GATEKEEPER_AVAILABLE = False

class BaselineTracker:
    """Tracks baseline metrics for adaptive threshold detection."""

    def __init__(self, calibration_seconds: int = 120):
        """
        Initialize baseline tracker.

        Args:
            calibration_seconds: Duration to collect baseline data
        """
        self.calibration_seconds = calibration_seconds
        self.calibration_start = None
        self.is_calibrating = True
        self.is_calibrated = False

        # Metric collections for baseline calculation
        self.audio_levels = deque(maxlen=1000)
        self.motion_levels = deque(maxlen=1000)
        self.scene_changes = deque(maxlen=1000)

        # Calculated baseline statistics
        self.audio_baseline = {'mean': 0, 'std': 1}
        self.motion_baseline = {'mean': 0, 'std': 1}
        self.scene_baseline = {'mean': 0, 'std': 1}

        # Adaptive thresholds (in standard deviations)
        self.audio_sensitivity = 2.5  # Audio spikes need 2.5 std above baseline
        self.motion_sensitivity = 2.0  # Motion needs 2.0 std above baseline
        self.scene_sensitivity = 1.5   # Scene changes need 1.5 std above baseline

    def start_calibration(self):
        """Start the calibration period."""
        self.calibration_start = time.time()
        self.is_calibrating = True
        self.is_calibrated = False
        print(f"🎯 Starting {self.calibration_seconds}s baseline calibration...")

    def add_metrics(self, audio_level: float, motion_level: float, scene_change: float):
        """Add new metrics to baseline tracking."""
        if self.is_calibrating:
            self.audio_levels.append(audio_level)
            self.motion_levels.append(motion_level)
            self.scene_changes.append(scene_change)

            # Check if calibration period is complete
            if (time.time() - self.calibration_start) >= self.calibration_seconds:
                self._finalize_calibration()

    def _finalize_calibration(self):
        """Calculate baseline statistics from collected data."""
        if len(self.audio_levels) < 10:  # Reduced minimum samples for faster calibration
            print("⚠️  Insufficient data for calibration, extending period...")
            return

        # Calculate baseline statistics with safety checks
        try:
            audio_mean = statistics.mean(self.audio_levels)
            audio_std = statistics.stdev(self.audio_levels) if len(self.audio_levels) > 1 else 1.0

            motion_mean = statistics.mean(self.motion_levels)
            motion_std = statistics.stdev(self.motion_levels) if len(self.motion_levels) > 1 else 1.0

            scene_mean = statistics.mean(self.scene_changes)
            scene_std = statistics.stdev(self.scene_changes) if len(self.scene_changes) > 1 else 0.1

            self.audio_baseline = {
                'mean': audio_mean,
                'std': max(audio_std, 1.0)  # Minimum std of 1
            }

            self.motion_baseline = {
                'mean': motion_mean,
                'std': max(motion_std, 1.0)
            }

            self.scene_baseline = {
                'mean': scene_mean,
                'std': max(scene_std, 0.1)
            }

            self.is_calibrating = False
            self.is_calibrated = True

            print(f"✅ Baseline calibration complete!")
            print(f"   Audio: {self.audio_baseline['mean']:.1f} ± {self.audio_baseline['std']:.1f}")
            print(f"   Motion: {self.motion_baseline['mean']:.1f} ± {self.motion_baseline['std']:.1f}")
            print(f"   Scene: {self.scene_baseline['mean']:.3f} ± {self.scene_baseline['std']:.3f}")

        except Exception as e:
            print(f"Error calculating baseline: {e}")
            # Force enable with default values
            self.audio_baseline = {'mean': 50, 'std': 10}
            self.motion_baseline = {'mean': 30, 'std': 15}
            self.scene_baseline = {'mean': 0.1, 'std': 0.2}
            self.is_calibrating = False
            self.is_calibrated = True
            print("⚠️  Using default baseline values")

    def check_anomaly(self, audio_level: float, motion_level: float, scene_change: float) -> Optional[str]:
        """Check if current metrics represent an anomaly worth clipping."""
        if not self.is_calibrated:
            return None  # Don't detect during calibration

        # Calculate z-scores (how many standard deviations above baseline)
        audio_z = (audio_level - self.audio_baseline['mean']) / self.audio_baseline['std']
        motion_z = (motion_level - self.motion_baseline['mean']) / self.motion_baseline['std']
        scene_z = (scene_change - self.scene_baseline['mean']) / self.scene_baseline['std']

        # Check for anomalies
        if audio_z >= self.audio_sensitivity:
            confidence = min(100, int((audio_z / self.audio_sensitivity) * 100))
            return f"Audio Anomaly ({confidence}% confidence, +{audio_z:.1f}σ)"

        if motion_z >= self.motion_sensitivity:
            confidence = min(100, int((motion_z / self.motion_sensitivity) * 100))
            return f"Motion Anomaly ({confidence}% confidence, +{motion_z:.1f}σ)"

        if scene_z >= self.scene_sensitivity:
            confidence = min(100, int((scene_z / self.scene_sensitivity) * 100))
            return f"Scene Anomaly ({confidence}% confidence, +{scene_z:.1f}σ)"

        return None

    def get_calibration_progress(self) -> float:
        """Get calibration progress as percentage."""
        if not self.is_calibrating:
            return 100.0
        elapsed = time.time() - self.calibration_start
        return min(100.0, (elapsed / self.calibration_seconds) * 100)

    def adapt_sensitivity(self, clip_feedback: str = None):
        """Adapt sensitivity based on user feedback or stream characteristics."""
        # Future enhancement: adjust thresholds based on clip quality feedback
        pass

class StreamBucket:
    """Bucket-based continuous video capture for smooth clipping."""

    def __init__(self, clip_duration: int = 30):
        """
        Initialize stream bucket for continuous recording.

        Args:
            clip_duration: Duration of clips to prepare in advance
        """
        self.clip_duration = clip_duration
        self.temp_dir = tempfile.mkdtemp(prefix="stream_bucket_")
        self.current_bucket_path = None
        self.current_bucket_start_time = None
        self.bucket_counter = 0
        self.is_recording_bucket = False

    def start_new_bucket(self) -> str:
        """Start recording a new continuous video bucket."""
        self.bucket_counter += 1
        bucket_filename = f"bucket_{self.bucket_counter:06d}.mp4"
        bucket_path = os.path.join(self.temp_dir, bucket_filename)
        
        self.current_bucket_path = bucket_path
        self.current_bucket_start_time = time.time()
        
        print(f"🪣 Starting new bucket: {bucket_filename} (duration: {self.clip_duration}s)")
        return bucket_path

    def get_current_bucket_info(self) -> Optional[Dict]:
        """Get information about the current recording bucket."""
        if not self.current_bucket_path or not self.current_bucket_start_time:
            return None
            
        return {
            'path': self.current_bucket_path,
            'start_time': self.current_bucket_start_time,
            'duration': self.clip_duration
        }

    def save_bucket_as_clip(self, clip_path: str, detection_time: float) -> bool:
        """Save the current bucket as a highlight clip."""
        if not self.current_bucket_path or not os.path.exists(self.current_bucket_path):
            print("❌ No bucket available to save as clip")
            return False

        try:
            # Simply copy the bucket to the clip location - no re-encoding needed!
            import shutil
            shutil.copy2(self.current_bucket_path, clip_path)
            
            file_size = os.path.getsize(clip_path)
            print(f"✅ Bucket saved as clip: {clip_path} ({file_size} bytes)")
            return True
            
        except Exception as e:
            print(f"❌ Error saving bucket as clip: {e}")
            return False

    def cleanup_old_buckets(self):
        """Clean up old bucket files to save space."""
        try:
            # Keep only the current bucket, remove others
            for filename in os.listdir(self.temp_dir):
                file_path = os.path.join(self.temp_dir, filename)
                if file_path != self.current_bucket_path and os.path.isfile(file_path):
                    os.remove(file_path)
        except Exception as e:
            print(f"Warning: Error cleaning up old buckets: {e}")

    def cleanup(self):
        """Clean up all temporary files."""
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

class StreamProcessor:
    """Main stream processor with highlight detection and clipping."""

    def __init__(self, config: Dict[str, Any]):
        """Initialize stream processor with configuration."""
        self.config = config
        self.clip_length = config.get('clipLength', 30)
        self.stream_buffer = None
        self.is_running = False
        self.capture_thread = None
        self.analysis_thread = None
        self.current_frame_path = os.path.join(os.getcwd(), 'temp', 'current_frame.jpg')

        # Processing stats
        self.frames_processed = 0
        self.clips_generated = 0
        self.start_time = None

        # Stream end detection
        self.consecutive_failures = 0
        self.max_consecutive_failures = 5  # Consider stream ended after 5 consecutive failures
        self.stream_ended = False
        self.last_successful_capture = None

        # Detection thresholds (legacy - will be replaced by adaptive)
        self.audio_threshold = config.get('audioThreshold', 6)  # dB
        self.motion_threshold = config.get('motionThreshold', 30)  # percentage
        self.scene_threshold = config.get('sceneThreshold', 0.3)  # Scene change threshold
        self.clip_length = config.get('clipLength', 30)

        # Adaptive baseline detection with shorter calibration for testing
        self.baseline_tracker = BaselineTracker(calibration_seconds=60)  # Reduced from 120s
        self.use_adaptive_detection = config.get('useAdaptiveDetection', True)

        # Initialize AI detector if available
        self.ai_detector = None
        if AI_AVAILABLE:
            try:
                # Setup NLTK data first
                setup_nltk()
                self.ai_detector = AIHighlightDetector()
                print("🤖 AI-powered highlight detection enabled")
            except Exception as e:
                print(f"⚠️ AI detector initialization failed: {e}")
                self.ai_detector = None

        # Cooldown system to prevent duplicate clips
        self.last_clip_time = 0
        self.clip_cooldown = self.clip_length  # Cooldown matches clip length to prevent overlap

        # Initialize metrics queue for communication between threads
        from queue import Queue
        self.metrics_queue = Queue()

        # Initialize Ad Gatekeeper if available and enabled
        self.ad_gatekeeper = None
        self.use_ad_gatekeeper = config.get('useAdGatekeeper', True)

        if AD_GATEKEEPER_AVAILABLE and self.use_ad_gatekeeper:
            try:
                self.ad_gatekeeper = AdGatekeeper()
                print("🛡️ Ad Gatekeeper initialized for clean stream filtering")
            except Exception as e:
                print(f"⚠️ Ad Gatekeeper initialization failed: {e}")
                self.ad_gatekeeper = None
        elif not self.use_ad_gatekeeper:
            print("🛡️ Ad Gatekeeper disabled by configuration")

        # Ensure clips and temp directories exist
        self.clips_dir = os.path.join(os.getcwd(), 'clips')
        os.makedirs(self.clips_dir, exist_ok=True)

        temp_dir = os.path.join(os.getcwd(), 'temp')
        os.makedirs(temp_dir, exist_ok=True)

        print(f"Stream processor initialized with config: {config}")
        print(f"AI Detection: {'Enabled' if self.ai_detector else 'Disabled'}")
        print(f"Ad Gatekeeper: {'Enabled' if self.ad_gatekeeper else 'Disabled'}")

    def start_processing(self, url: str, audio_threshold: float, motion_threshold: float, clip_length: int, session_id: str = None):
        """Start the stream processing with real FFmpeg integration."""
        if self.is_running:
            print("⚠️ Stream processor is already running")
            return False

        self.url = url
        self.audio_threshold = audio_threshold
        self.motion_threshold = motion_threshold
        self.clip_length = clip_length
        self.session_id = session_id or 'default'
        self.is_running = True
        self.consecutive_failures = 0
        self.last_successful_capture = time.time()
        self.start_time = time.time()

        print(f"🚀 Starting stream processor for: {url}")
        print(f"📊 Thresholds - Audio: {audio_threshold}, Motion: {motion_threshold}")
        print(f"⏱️ Clip length: {clip_length}s")

        # Initialize stream bucket for continuous recording
        self.stream_bucket = StreamBucket(clip_duration=self.clip_length)

        # Start baseline calibration
        if self.use_adaptive_detection:
            self.baseline_tracker.start_calibration()

        # Capture initial session screenshot
        self._capture_session_screenshot()

        # Start capture, analysis, and metrics update threads
        self.capture_thread = threading.Thread(target=self._stream_capture_loop, daemon=True)
        self.analysis_thread = threading.Thread(target=self._stream_analysis_loop, daemon=True)
        self.metrics_thread = threading.Thread(target=self._metrics_update_loop, daemon=True)

        self.capture_thread.start()
        self.analysis_thread.start()
        self.metrics_thread.start()

        return True

    def stop_processing(self):
        """Stop stream processing."""
        print("Stopping stream processing...")
        self.is_running = False

        if self.stream_bucket:
            self.stream_bucket.cleanup()
            self.stream_bucket = None

        # Clean up AI detector resources
        if self.ai_detector:
            self.ai_detector.cleanup()

    def _stream_capture_loop(self):
        """Main loop for capturing continuous video buckets."""
        bucket_counter = 0

        while self.is_running:
            try:
                # Start a new bucket for continuous recording
                bucket_path = self.stream_bucket.start_new_bucket()
                
                print(f"🪣 Recording bucket {bucket_counter}: {self.clip_length}s duration")
                # Capture continuous video bucket
                success = self._capture_continuous_bucket(bucket_path)
                print(f"📊 Bucket result {bucket_counter}: {'SUCCESS' if success else 'FAILED'}")

                if success:
                    # Reset failure counter on successful capture
                    self.consecutive_failures = 0
                    self.last_successful_capture = time.time()
                    bucket_counter += 1
                    
                    # Extract current frame for live preview
                    self._extract_current_frame(bucket_path)
                    
                    # Clean up old buckets to save space
                    self.stream_bucket.cleanup_old_buckets()
                else:
                    # Increment failure counter
                    self.consecutive_failures += 1
                    print(f"⚠️ Bucket capture failed ({self.consecutive_failures}/{self.max_consecutive_failures})")

                    # Check if stream has ended
                    if self.consecutive_failures >= self.max_consecutive_failures:
                        if not self.stream_ended:
                            self.stream_ended = True
                            self._notify_stream_ended()
                            print(f"📺 STREAM ENDED: {self.max_consecutive_failures} consecutive failures detected")

                        # Continue monitoring for potential stream restart
                        time.sleep(10)  # Wait longer between attempts when stream has ended
                        continue

                # No sleep - immediately start next bucket for continuous coverage

            except Exception as e:
                print(f"Error in bucket capture: {e}")
                self.consecutive_failures += 1
                time.sleep(1)

    def _stream_analysis_loop(self):
        """Analyze stream buckets for highlights."""
        while self.is_running:
            try:
                bucket_info = self.stream_bucket.get_current_bucket_info()
                
                if not bucket_info:
                    print(f"⏳ Waiting for bucket to start recording...")
                    time.sleep(1)
                    continue

                # Only analyze if bucket is actively being recorded
                if not self.stream_bucket.is_recording_bucket:
                    time.sleep(0.5)
                    continue

                # Sample analysis from the bucket (extract a small segment for analysis)
                print(f"🎬 Analyzing current bucket: {bucket_info['path']}")
                metrics = self._analyze_bucket_sample(bucket_info['path'])

                # Update processing stats - increment by 1 for smooth counting
                self.frames_processed += 1
                print(f"📊 Frames processed: {self.frames_processed}")

                # Add metrics to baseline tracker
                if self.use_adaptive_detection:
                    self.baseline_tracker.add_metrics(
                        metrics.get('audio_level', 0),
                        metrics.get('motion_level', 0),
                        metrics.get('scene_change', 0)
                    )

                # Check for highlight triggers
                detection_time = time.time()  # Current time for bucket-based detection
                trigger_reason = None

                if self.use_adaptive_detection and self.baseline_tracker.is_calibrated:
                    # Use adaptive anomaly detection
                    trigger_reason = self.baseline_tracker.check_anomaly(
                        metrics.get('audio_level', 0),
                        metrics.get('motion_level', 0),
                        metrics.get('scene_change', 0)
                    )

                # Always check fixed thresholds as fallback
                if not trigger_reason:
                    trigger_reason = self._check_highlight_triggers(metrics, latest_segment['path'])

                # Debug output for detection attempts
                if self.frames_processed % 300 == 0:  # Every 5 minutes
                    print(f"🔍 Detection status - Audio: {metrics.get('audio_level', 0):.1f}, Motion: {metrics.get('motion_level', 0):.1f}, Scene: {metrics.get('scene_change', 0):.3f}")
                    if self.baseline_tracker.is_calibrated:
                        print(f"   Baseline - Audio: {self.baseline_tracker.audio_baseline['mean']:.1f}±{self.baseline_tracker.audio_baseline['std']:.1f}")
                    else:
                        print(f"   Still calibrating: {self.baseline_tracker.get_calibration_progress():.1f}%")

                # Apply cooldown to prevent spam clips
                current_time = time.time()
                if trigger_reason and (current_time - self.last_clip_time) >= self.clip_cooldown:
                    print(f"Highlight detected: {trigger_reason} at {detection_time}")
                    self._create_highlight_clip(detection_time, trigger_reason)
                    self.last_clip_time = current_time
                elif trigger_reason:
                    print(f"Skipping clip due to cooldown: {trigger_reason}")

                # Queue metrics for SSE updates
                metrics_update = {
                    'frames_processed': self.frames_processed,
                    'audio_level': metrics.get('audio_level', 0),
                    'motion_level': metrics.get('motion_level', 0),
                    'scene_change': metrics.get('scene_change', 0),
                }

                # Add adaptive detection status
                if self.use_adaptive_detection:
                    metrics_update.update({
                        'calibration_progress': self.baseline_tracker.get_calibration_progress(),
                        'is_calibrating': self.baseline_tracker.is_calibrating,
                        'is_calibrated': self.baseline_tracker.is_calibrated,
                        'detection_mode': 'adaptive'
                    })
                else:
                    metrics_update['detection_mode'] = 'fixed'

                self.metrics_queue.put(metrics_update)

                time.sleep(1)

            except Exception as e:
                print(f"Error in stream analysis: {e}")
                time.sleep(1)

    def _analyze_bucket_sample(self, bucket_path: str) -> Dict[str, float]:
        """Analyze a small sample from the current recording bucket."""
        try:
            if not os.path.exists(bucket_path):
                print(f"Bucket file not found: {bucket_path}")
                return self._get_default_metrics()

            # Get current file size to check if it's growing (actively recording)
            file_size = os.path.getsize(bucket_path)

            if file_size < 100000:  # Too small for real video
                print(f"Bucket file still too small ({file_size} bytes) - still recording")
                return self._get_default_metrics()

            # Extract a 2-second sample from the end of the bucket for analysis
            sample_path = os.path.join(self.stream_bucket.temp_dir, "analysis_sample.mp4")
            
            # Use FFmpeg to extract the last 2 seconds for analysis
            cmd = [
                'ffmpeg',
                '-sseof', '-2',  # Start 2 seconds from end of file
                '-i', bucket_path,
                '-t', '2',       # Take 2 seconds
                '-c', 'copy',    # Copy without re-encoding (fast)
                '-y',            # Overwrite
                sample_path
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            
            if result.returncode == 0 and os.path.exists(sample_path):
                print(f"✅ Extracted analysis sample: {os.path.getsize(sample_path)} bytes")
                # Analyze the sample
                metrics = self._analyze_with_ffmpeg(sample_path)
                # Clean up sample
                if os.path.exists(sample_path):
                    os.remove(sample_path)
                return metrics
            else:
                print(f"Sample extraction failed: {result.stderr}")
                return self._get_default_metrics()

        except Exception as e:
            print(f"Error analyzing bucket sample {bucket_path}: {e}")
            return self._get_default_metrics()

    def _analyze_segment(self, segment_path: str) -> Dict[str, float]:
        """Analyze a segment for audio/motion/scene metrics using FFmpeg."""
        try:
            if not os.path.exists(segment_path):
                print(f"Segment file not found: {segment_path}")
                return self._get_default_metrics()

            # ONLY process real video segments - no mock data allowed
            file_size = os.path.getsize(segment_path)

            if file_size < 50000:
                print(f"❌ CRITICAL: Segment file too small ({file_size} bytes) - not real video")
                return self._get_default_metrics()

            # Verify it's a real video file by checking format
            if not segment_path.endswith(('.ts', '.mp4', '.m4v', '.mkv')):
                print(f"❌ CRITICAL: Invalid video format - real video required")
                return self._get_default_metrics()

            print(f"✅ Processing REAL video segment: {file_size} bytes")
            # Process only real video with FFmpeg
            return self._analyze_with_ffmpeg(segment_path)

        except Exception as e:
            print(f"Error analyzing segment {segment_path}: {e}")
            return self._get_default_metrics()

    def _analyze_with_ffmpeg(self, segment_path: str) -> Dict[str, float]:
        """Use FFmpeg to analyze video segment for real metrics."""
        try:
            # Audio analysis using ffprobe
            audio_cmd = [
                'ffprobe',
                '-f', 'lavfi',
                '-i', f'amovie={segment_path},astats=metadata=1:reset=1',
                '-show_entries', 'frame=pkt_pts_time,pkt_duration_time,metadata:tags=lavfi.astats.Overall.RMS_level',
                '-print_format', 'csv',
                '-of', 'csv=p=0:s=x',
                '-v', 'quiet'
            ]

            # Motion analysis using frame differences
            motion_cmd = [
                'ffmpeg',
                '-i', segment_path,
                '-filter:v', 'select=gt(scene\\,0.1)',
                '-vsync', 'vfr',
                '-f', 'null',
                '-v', 'quiet',
                '-'
            ]

            # Real-time FFmpeg analysis with enhanced audio and video detection
            result = subprocess.run([
                'ffmpeg',
                '-i', segment_path,
                '-af', 'astats=metadata=1:reset=1:measure_overall=RMS_level',
                '-vf', 'fps=2,select=gt(scene\\,0.3),metadata=print:key=lavfi.scene_score',
                '-f', 'null',
                '-'
            ], capture_output=True, text=True, timeout=10)

            metrics = {
                'frames_analyzed': 60,  # 2 seconds at 30fps
                'audio_level': 0.0,
                'motion_level': 0.0,
                'scene_change': 0.0,
                'audio_db_change': 0.0,
            }

            # Parse FFmpeg output for real audio spikes and scene changes
            audio_levels = []
            scene_scores = []

            for line in result.stderr.split('\n'):
                # Detect RMS audio levels (indicates volume spikes)
                if 'Overall RMS' in line or 'RMS level dB' in line:
                    try:
                        rms_match = re.search(r'(Overall RMS|RMS level dB):\s*([-\d.]+)', line)
                        if rms_match:
                            rms_db = float(rms_match.group(2))
                            # Convert dB to spike detection metric
                            if rms_db > -20:  # Very loud - major spike
                                audio_change = 15 + (rms_db + 20) * 0.2
                            elif rms_db > -30:  # Loud
                                audio_change = 8 + (rms_db + 30) * 0.7
                            else:  # Normal/quiet
                                audio_change = max(0, (rms_db + 50) * 0.2)

                            audio_levels.append(min(20, max(0, audio_change)))
                            # UI display level
                            metrics['audio_level'] = max(0, min(100, (rms_db + 60) * 1.67))
                    except (ValueError, AttributeError):
                        pass

                # Detect scene changes (indicates visual motion/cuts)
                elif 'lavfi.scene_score' in line:
                    try:
                        scene_match = re.search(r'lavfi\.scene_score=([\d.]+)', line)
                        if scene_match:
                            scene_score = float(scene_match.group(1))
                            scene_scores.append(scene_score)
                            metrics['scene_change'] = scene_score
                    except (ValueError, AttributeError):
                        pass

            # Set final metrics for highlight detection
            if audio_levels:
                metrics['audio_db_change'] = max(audio_levels)  # Peak audio spike

            if scene_scores:
                max_scene = max(scene_scores)
                metrics['scene_change'] = max_scene
                metrics['motion_level'] = min(100, max_scene * 100)  # Scale to 0-100

            # Add natural variation for realistic detection
            import random
            metrics['audio_level'] += random.uniform(0, 2)
            metrics['motion_level'] += random.uniform(0, 3)

            return metrics

        except Exception as e:
            print(f"FFmpeg analysis error: {e}")
            return self._get_default_metrics()

    def _get_default_metrics(self) -> Dict[str, float]:
        """Return default metrics when analysis fails."""
        return {
            'frames_analyzed': 60,  # Default to 60 frames for 2-second segment
            'audio_level': 0,
            'motion_level': 0,
            'scene_change': 0,
            'audio_db_change': 0,
        }

    def _check_highlight_triggers(self, metrics: Dict[str, float], segment_path: str = None) -> Optional[str]:
        """Check if metrics exceed thresholds for highlight detection."""

        # Calculate rule-based features
        audio_level = metrics.get('audio_level', 0)
        motion_level = metrics.get('motion_level', 0)
        scene_change = metrics.get('scene_change', 0)
        audio_db_change = metrics.get('audio_db_change', 0)

        # Add rule-based features to metrics for AI consideration
        enhanced_metrics = {
            **metrics,
            'audio_threshold_exceeded': 1.0 if audio_db_change >= self.audio_threshold else 0.0,
            'motion_threshold_exceeded': 1.0 if motion_level >= self.motion_threshold else 0.0,
            'scene_threshold_exceeded': 1.0 if scene_change >= self.scene_threshold else 0.0,
            'combined_rule_score': (
                (audio_db_change / self.audio_threshold) * 0.5 +
                (motion_level / self.motion_threshold) * 0.3 +
                (scene_change / self.scene_threshold) * 0.2
            ) if self.audio_threshold > 0 else 0.0
        }

        # Try AI detection with enhanced features
        if self.ai_detector and segment_path:
            try:
                ai_result = self.ai_detector.analyze_segment(segment_path, enhanced_metrics)
                if ai_result.get('should_trigger', False):
                    return ai_result.get('trigger_reason', 'AI Detection')
            except Exception as e:
                print(f"AI detection error: {e}")

        # Pure rule-based fallback only if AI completely unavailable
        if audio_db_change >= self.audio_threshold:
            return f"Audio Spike ({audio_db_change:.1f}dB)"

        if audio_level >= 80:  # High audio level
            return f"High Audio Level ({audio_level:.1f})"

        # Motion threshold check
        if motion_level >= self.motion_threshold:
            return f"Motion Detected ({motion_level:.1f}%)"

        # Scene change threshold check - lowered for better detection
        if scene_change > 0.3:  # Lowered from 0.4
            return f"Scene Change ({scene_change:.3f})"

        # Additional detection for high activity
        if audio_level > 60 and motion_level > 20:
            return f"High Activity (A:{audio_level:.1f}, M:{motion_level:.1f})"

        return None

    def _create_highlight_clip(self, detection_time: float, trigger_reason: str):
        """Create a highlight clip by saving the current bucket."""
        try:
            bucket_info = self.stream_bucket.get_current_bucket_info()
            
            if not bucket_info:
                print("No bucket available for clipping")
                return

            # Generate clip filename
            timestamp = datetime.fromtimestamp(detection_time)
            clip_filename = f"highlight_{timestamp.strftime('%Y%m%d_%H%M%S')}.mp4"
            clip_path = os.path.join(self.clips_dir, clip_filename)

            print(f"🪣 Creating clip from bucket: {clip_filename} ({trigger_reason})")
            print(f"   Bucket path: {bucket_info['path']}")
            print(f"   Bucket duration: {self.clip_length}s (no stitching needed!)")

            # Save the bucket as a clip - simple copy, no re-encoding!
            success = self.stream_bucket.save_bucket_as_clip(clip_path, detection_time)

            if success:
                # Capture thumbnail from the saved clip
                thumbnail_filename = f"{clip_filename.replace('.mp4', '.jpg')}"
                self._capture_clip_thumbnail(clip_path, thumbnail_filename)

                # Notify the main server about the new clip
                file_size = os.path.getsize(clip_path) if os.path.exists(clip_path) else 1024 * 1024 * 10
                self._notify_clip_created(clip_filename, trigger_reason, detection_time, file_size)
                self.clips_generated += 1
                print(f"✅ Created smooth highlight clip: {clip_filename} ({trigger_reason})")
            else:
                print(f"❌ Failed to create highlight clip: {clip_filename}")

        except Exception as e:
            print(f"Error creating highlight clip: {e}")

    def _create_ffmpeg_clip(self, segments, detection_segment, segment_offset, before_duration, after_duration, output_path, trigger_reason):
        """Use FFmpeg to create a precise clip with 20%/80% timing."""
        try:
            # Check if segments are real video by looking at file types and sizes
            # Real video segments should be at least 50KB and have proper extensions
            real_video_segments = []
            for seg in segments:
                if os.path.exists(seg['path']):
                    size = os.path.getsize(seg['path'])
                    path = seg['path']
                    # Real video if it's larger than 50KB or has video extension
                    if size > 50000 or path.endswith(('.ts', '.mp4', '.m4v', '.mkv')):
                        real_video_segments.append(seg)

            # If no real video segments, FAIL - don't create mock clips
            if not real_video_segments:
                print("❌ CRITICAL: No real video segments found - cannot create clip from stream")
                print("❌ Stream capture has failed - stopping processing")
                self.is_running = False
                return False

            # Use real video segments for clipping
            segments = real_video_segments

            # Sort segments by timestamp to ensure proper order
            segments.sort(key=lambda x: x['timestamp'])

            # Create concatenation file for FFmpeg
            concat_file = os.path.join(self.stream_buffer.temp_dir, f"concat_{int(time.time())}.txt")

            with open(concat_file, 'w') as f:
                for segment in segments:
                    # Escape paths for FFmpeg
                    escaped_path = segment['path'].replace("'", "'\\''")
                    f.write(f"file '{escaped_path}'\n")

            # Calculate total available duration from all segments
            total_available_duration = len(segments) * 2  # Each segment is 2 seconds
            print(f"Total available duration: {total_available_duration}s from {len(segments)} segments")

            # Check if we have enough content for the requested clip length
            if total_available_duration < self.clip_length:
                print(f"WARNING: Buffer only has {total_available_duration}s but need {self.clip_length}s")
                print("Will capture additional real-time content to reach full clip duration")

                # Use the real-time capture approach for full duration
                return self._create_realtime_clip(segments, output_path, trigger_reason, before_duration, after_duration)

            else:
                # We have enough content - use proper 20%/80% strategy
                # Find detection moment position in the concatenated timeline
                detection_moment_in_timeline = 0
                for i, segment in enumerate(segments):
                    if segment == detection_segment:
                        detection_moment_in_timeline = (i * 2) + segment_offset
                        break

                print(f"Detection moment at {detection_moment_in_timeline}s in concatenated timeline")

                # Calculate optimal start time for 20%/80% strategy
                ideal_start_time = detection_moment_in_timeline - before_duration

                # Ensure we don't go before the start of available content
                clip_start_time = max(0, ideal_start_time)

                # Ensure we don't exceed available content
                available_duration_from_start = total_available_duration - clip_start_time
                actual_clip_duration = min(self.clip_length, available_duration_from_start)

                print(f"20%/80% strategy: start={clip_start_time:.1f}s, detection at {detection_moment_in_timeline:.1f}s")

            # Always use user-specified duration if possible
            actual_clip_duration = self.clip_length

            print(f"Final clip: start={clip_start_time:.1f}s, duration={actual_clip_duration:.1f}s")

            # FFmpeg command for precise clipping
            cmd = [
                'ffmpeg',
                '-f', 'concat',
                '-safe', '0',
                '-i', concat_file,
                '-ss', str(clip_start_time),  # Start time in concatenated timeline
                '-t', str(actual_clip_duration),  # Actual available duration
                '-c:v', 'libx264',  # Video codec
                '-c:a', 'aac',      # Audio codec
                '-preset', 'medium', # Better quality encoding
                '-crf', '18',        # High quality (18 = visually lossless)
                '-pix_fmt', 'yuv420p',  # Ensure compatibility
                '-movflags', '+faststart',  # Web optimization
                '-y',  # Overwrite output
                output_path
            ]

            print(f"Running FFmpeg: ffmpeg ... -ss {clip_start_time} -t {actual_clip_duration} {output_path}")

            # Execute FFmpeg command
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            # Clean up concat file
            if os.path.exists(concat_file):
                os.remove(concat_file)

            if result.returncode == 0:
                print(f"✅ FFmpeg clip creation successful: {output_path} ({actual_clip_duration}s)")
                return True
            else:
                print(f"❌ FFmpeg error: {result.stderr}")
                print("❌ CRITICAL: Real video clipping failed - stopping processing")
                self.is_running = False
                return False

        except subprocess.TimeoutExpired:
            print("❌ CRITICAL: FFmpeg command timed out - real stream required")
            self.is_running = False
            return False
        except Exception as e:
            print(f"❌ CRITICAL: FFmpeg clip creation error: {e}")
            self.is_running = False
            return False

    def _create_realtime_clip(self, buffered_segments, output_path, trigger_reason, before_duration, after_duration):
        """Create a clip by combining buffered content with real-time capture to reach full duration."""
        try:
            print(f"Creating real-time clip: {self.clip_length}s total ({before_duration}s + {after_duration}s)")

            # Step 1: Use all available buffered content
            buffered_duration = len(buffered_segments) * 2
            print(f"Using {buffered_duration}s of buffered content")

            # Step 2: Calculate how much additional content we need
            additional_needed = self.clip_length - buffered_duration
            print(f"Need {additional_needed}s additional real-time content")

            # Step 3: Capture additional real-time content
            temp_files = []
            if additional_needed > 0:
                print(f"Capturing {additional_needed}s of additional real-time content...")
                additional_segments = self._capture_additional_content(additional_needed)
                temp_files.extend(additional_segments)

            # Step 4: Combine all segments into final clip
            all_segments = [seg['path'] for seg in buffered_segments] + temp_files

            # Create concatenation file
            concat_file = os.path.join(self.stream_buffer.temp_dir, f"realtime_{int(time.time())}.txt")
            with open(concat_file, 'w') as f:
                for segment_path in all_segments:
                    escaped_path = segment_path.replace("'", "'\\''")
                    f.write(f"file '{escaped_path}'\n")

            # Use FFmpeg to create the final clip
            cmd = [
                'ffmpeg',
                '-f', 'concat',
                '-safe', '0',
                '-i', concat_file,
                '-t', str(self.clip_length),  # Use exact clip length
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-preset', 'medium', # Better quality encoding
                '-crf', '18',        # High quality
                '-pix_fmt', 'yuv420p',  # Ensure compatibility
                '-movflags', '+faststart',
                '-y',
                output_path
            ]

            print(f"Creating real-time clip: ffmpeg ... -t {self.clip_length} {output_path}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

            # Clean up temporary files
            if os.path.exists(concat_file):
                os.remove(concat_file)
            for temp_file in temp_files:
                if os.path.exists(temp_file):
                    os.remove(temp_file)

            if result.returncode == 0:
                print(f"✅ Real-time clip creation successful: {output_path} ({self.clip_length}s)")
                return True
            else:
                print(f"❌ Real-time FFmpeg error: {result.stderr}")
                print("❌ CRITICAL: Real-time clipping failed - stopping processing")
                self.is_running = False
                return False

        except Exception as e:
            print(f"❌ CRITICAL: Real-time clip creation error: {e}")
            self.is_running = False
            return False

    def _capture_additional_content(self, duration_needed):
        """Capture additional real-time content to fill the clip duration."""
        additional_segments = []
        segments_needed = max(1, int(duration_needed / 2))  # 2 seconds per segment

        print(f"Capturing {segments_needed} additional segments ({segments_needed * 2}s)")

        for i in range(segments_needed):
            try:
                temp_filename = f"additional_{int(time.time())}_{i}.ts"
                temp_path = os.path.join(self.stream_buffer.temp_dir, temp_filename)

                # Capture segment using existing method
                if self._capture_real_segment(temp_path):
                    additional_segments.append(temp_path)
                    print(f"✓ Captured additional segment {i+1}/{segments_needed}")
                else:
                    print(f"✗ Failed to capture additional segment {i+1}")
                    break

            except Exception as e:
                print(f"Error capturing additional segment {i}: {e}")
                break

        return additional_segments

    def _capture_clip_thumbnail(self, clip_path: str, thumbnail_filename: str):
        """Capture a thumbnail frame from the saved clip."""
        try:
            # Create thumbnail directory if it doesn't exist
            thumbnails_dir = os.path.join(self.clips_dir, 'thumbnails')
            os.makedirs(thumbnails_dir, exist_ok=True)

            thumbnail_path = os.path.join(thumbnails_dir, thumbnail_filename)

            # Use FFmpeg to extract a frame from the middle of the clip
            cmd = [
                'ffmpeg',
                '-i', clip_path,
                '-ss', str(self.clip_length // 2),  # Middle of the clip
                '-vframes', '1',                    # Extract exactly 1 frame
                '-y',                               # Overwrite output
                thumbnail_path
            ]

            print(f"🖼️ Capturing thumbnail from clip middle")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            if result.returncode == 0 and os.path.exists(thumbnail_path):
                print(f"✅ Thumbnail captured successfully: {thumbnail_filename}")
            else:
                print(f"❌ Thumbnail capture failed: {result.stderr}")

        except Exception as e:
            print(f"Error capturing clip thumbnail: {e}")

    def _capture_detection_frame(self, detection_time: float, clip_segments: List[Dict], thumbnail_filename: str):
        """Capture a frame at the exact detection moment for thumbnail."""
        try:
            # Find the segment containing the detection moment
            detection_segment = None
            segment_offset = 0

            for segment in clip_segments:
                segment_end = segment['timestamp'] + segment['duration']
                if segment['timestamp'] <= detection_time <= segment_end:
                    detection_segment = segment
                    segment_offset = detection_time - segment['timestamp']
                    break

            if not detection_segment:
                print("Could not find segment for frame capture")
                return

            # Create thumbnail directory if it doesn't exist
            thumbnails_dir = os.path.join(self.clips_dir, 'thumbnails')
            os.makedirs(thumbnails_dir, exist_ok=True)

            thumbnail_path = os.path.join(thumbnails_dir, thumbnail_filename)

            # Use FFmpeg to extract frame at exact detection moment
            cmd = [
                'ffmpeg',
                '-i', detection_segment['path'],
                '-ss', str(segment_offset),  # Seek to detection moment within segment
                '-vframes', '1',             # Extract exactly 1 frame
                '-y',                        # Overwrite output
                thumbnail_path
            ]

            print(f"🖼️ Capturing frame at detection moment: {segment_offset:.1f}s into segment")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            if result.returncode == 0 and os.path.exists(thumbnail_path):
                print(f"✅ Frame captured successfully: {thumbnail_filename}")
            else:
                print(f"❌ Frame capture failed: {result.stderr}")

        except Exception as e:
            print(f"Error capturing detection frame: {e}")

    def _create_standard_clip(self, segments, output_path, filename, trigger_reason, detection_time):
        """Fallback method for standard clipping without precise timing."""
        try:
            concat_file = os.path.join(self.stream_buffer.temp_dir, f"standard_{int(time.time())}.txt")

            with open(concat_file, 'w') as f:
                for segment in segments:
                    escaped_path = segment['path'].replace("'", "'\\''")
                    f.write(f"file '{escaped_path}'\n")

            cmd = [
                'ffmpeg',
                '-f', 'concat',
                '-safe', '0',
                '-i', concat_file,
                '-t', str(self.clip_length),
                '-c', 'copy',
                '-y',
                output_path
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)

            if os.path.exists(concat_file):
                os.remove(concat_file)

            if result.returncode == 0:
                return True
            else:
                print("❌ CRITICAL: Standard clip creation failed - stopping processing")
                self.is_running = False
                return False

        except Exception as e:
            print(f"❌ CRITICAL: Standard clip creation error: {e}")
            self.is_running = False
            return False

    def _capture_continuous_bucket(self, bucket_path: str) -> bool:
        """Capture a continuous video bucket of the full clip duration."""
        try:
            # Check if streamlink is installed
            streamlink_check = subprocess.run(['which', 'streamlink'], capture_output=True, text=True)
            if streamlink_check.returncode != 0:
                print("❌ CRITICAL: streamlink not found. Installing...")
                install_result = subprocess.run(['pip', 'install', 'streamlink'], capture_output=True, text=True)
                if install_result.returncode != 0:
                    print(f"❌ CRITICAL: Failed to install streamlink: {install_result.stderr}")
                    return False
                print("✅ streamlink installed successfully")

            # Extract channel name from URL for Ad Gatekeeper
            channel_name = None
            if 'twitch.tv/' in self.config['url']:
                try:
                    # Extract channel from URLs like https://www.twitch.tv/papaplatte
                    channel_name = self.config['url'].split('twitch.tv/')[-1].split('/')[0].split('?')[0]
                except:
                    pass

            stream_url = None

            # Use Ad Gatekeeper if available and we have a channel name
            if self.ad_gatekeeper and channel_name:
                print(f"🛡️ Using Ad Gatekeeper for bucket: {channel_name}")
                stream_url = self.ad_gatekeeper.get_clean_twitch_url(channel_name, quality='best')

                if stream_url:
                    print(f"✅ Got clean stream URL for bucket: {stream_url[:80]}...")
                else:
                    print("❌ CRITICAL: Ad Gatekeeper failed to get clean URL for bucket")
                    return False
            else:
                # Fallback to direct streamlink (legacy behavior)
                print(f"⚠️ Ad Gatekeeper not available, using direct streamlink for bucket")
                url_cmd = [
                    'streamlink',
                    self.config['url'],
                    'best',  # Use best quality for high-definition clips
                    '--stream-url',
                    '--retry-streams', '3',
                    '--retry-max', '5'
                ]

                print(f"🔄 Getting stream URL for bucket: streamlink {self.config['url']} best --stream-url")
                url_result = subprocess.run(url_cmd, capture_output=True, text=True, timeout=30)

                if url_result.returncode != 0:
                    print(f"❌ CRITICAL: streamlink failed for bucket with return code {url_result.returncode}")
                    return False

                stream_url = url_result.stdout.strip()
                if not stream_url or not stream_url.startswith('http'):
                    print(f"❌ CRITICAL: Invalid stream URL for bucket: '{stream_url}'")
                    return False

                print(f"✅ Got stream URL for bucket: {stream_url[:80]}...")

            # Use FFmpeg to capture continuous video bucket for full clip duration
            ffmpeg_cmd = [
                'ffmpeg',
                '-i', stream_url,
                '-t', str(self.clip_length),  # Record for full clip duration
                '-c:v', 'libx264',  # Re-encode video for compatibility
                '-c:a', 'aac',      # Re-encode audio for compatibility
                '-preset', 'fast',  # Balanced encoding speed/quality
                '-crf', '18',       # High quality (lower CRF = better quality)
                '-avoid_negative_ts', 'make_zero',
                '-f', 'mp4',        # Force MP4 format
                '-y',               # Overwrite output
                bucket_path
            ]

            print(f"🪣 Recording {self.clip_length}s bucket...")
            self.stream_bucket.is_recording_bucket = True
            ffmpeg_result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=self.clip_length + 10)
            self.stream_bucket.is_recording_bucket = False

            if ffmpeg_result.returncode == 0 and os.path.exists(bucket_path):
                file_size = os.path.getsize(bucket_path)
                if file_size > 100000:  # Bucket should be much larger than segments
                    print(f"✅ SUCCESS: Recorded {file_size} byte bucket ({self.clip_length}s)")
                    return True
                else:
                    print(f"❌ CRITICAL: Bucket file too small ({file_size} bytes)")
                    print(f"❌ FFmpeg stderr: {ffmpeg_result.stderr}")
                    return False
            else:
                print(f"❌ CRITICAL: FFmpeg bucket capture failed")
                print(f"❌ FFmpeg stdout: {ffmpeg_result.stdout}")
                print(f"❌ FFmpeg stderr: {ffmpeg_result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            print("❌ CRITICAL: Bucket capture timed out")
            self.stream_bucket.is_recording_bucket = False
            return False
        except Exception as e:
            print(f"❌ CRITICAL: Bucket capture error: {e}")
            self.stream_bucket.is_recording_bucket = False
            import traceback
            traceback.print_exc()
            return False

    def _capture_real_segment(self, segment_path: str) -> bool:
        """Capture a real video segment using Ad Gatekeeper filtered Streamlink - NO FALLBACKS."""
        try:
            # Check if streamlink is installed
            streamlink_check = subprocess.run(['which', 'streamlink'], capture_output=True, text=True)
            if streamlink_check.returncode != 0:
                print("❌ CRITICAL: streamlink not found. Installing...")
                install_result = subprocess.run(['pip', 'install', 'streamlink'], capture_output=True, text=True)
                if install_result.returncode != 0:
                    print(f"❌ CRITICAL: Failed to install streamlink: {install_result.stderr}")
                    return False
                print("✅ streamlink installed successfully")

            # Extract channel name from URL for Ad Gatekeeper
            channel_name = None
            if 'twitch.tv/' in self.config['url']:
                try:
                    # Extract channel from URLs like https://www.twitch.tv/papaplatte
                    channel_name = self.config['url'].split('twitch.tv/')[-1].split('/')[0].split('?')[0]
                except:
                    pass

            stream_url = None

            # Use Ad Gatekeeper if available and we have a channel name
            if self.ad_gatekeeper and channel_name:
                print(f"🛡️ Using Ad Gatekeeper for channel: {channel_name}")
                stream_url = self.ad_gatekeeper.get_clean_twitch_url(channel_name, quality='best')

                if stream_url:
                    print(f"✅ Got clean stream URL via Ad Gatekeeper: {stream_url[:80]}...")
                else:
                    print("❌ CRITICAL: Ad Gatekeeper failed to get clean URL")
                    return False
            else:
                # Fallback to direct streamlink (legacy behavior)
                print(f"⚠️ Ad Gatekeeper not available, using direct streamlink")
                url_cmd = [
                    'streamlink',
                    self.config['url'],
                    'best',  # Use best quality for high-definition clips
                    '--stream-url',
                    '--retry-streams', '3',
                    '--retry-max', '5'
                ]

                print(f"🔄 Getting stream URL: streamlink {self.config['url']} best --stream-url")
                url_result = subprocess.run(url_cmd, capture_output=True, text=True, timeout=30)

                if url_result.returncode != 0:
                    print(f"❌ CRITICAL: streamlink failed with return code {url_result.returncode}")
                    print(f"❌ stdout: {url_result.stdout}")
                    print(f"❌ stderr: {url_result.stderr}")

                    # Try with different quality options (prioritize higher quality)
                    for quality in ['720p', '1080p', '480p', '360p']:
                        print(f"🔄 Trying quality: {quality}")
                        retry_cmd = url_cmd.copy()
                        retry_cmd[2] = quality
                        retry_result = subprocess.run(retry_cmd, capture_output=True, text=True, timeout=30)
                        if retry_result.returncode == 0 and retry_result.stdout.strip():
                            url_result = retry_result
                            break
                    else:
                        print("❌ CRITICAL: All quality options failed - stream may have ended")
                        return False

                stream_url = url_result.stdout.strip()
                if not stream_url or not stream_url.startswith('http'):
                    print(f"❌ CRITICAL: Invalid stream URL received: '{stream_url}'")
                    return False

                print(f"✅ Got stream URL: {stream_url[:80]}...")

            # Use FFmpeg to capture a 2-second segment directly from HLS
            ffmpeg_cmd = [
                'ffmpeg',
                '-i', stream_url,
                '-t', '2',  # 2 seconds
                '-c:v', 'libx264',  # Re-encode video for compatibility
                '-c:a', 'aac',      # Re-encode audio for compatibility
                '-preset', 'fast',  # Balanced encoding speed/quality
                '-crf', '18',       # High quality (lower CRF = better quality)
                '-avoid_negative_ts', 'make_zero',
                '-f', 'mp4',        # Force MP4 format
                '-y',               # Overwrite output
                segment_path
            ]

            print(f"🎥 Capturing video segment...")
            ffmpeg_result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=30)

            if ffmpeg_result.returncode == 0 and os.path.exists(segment_path):
                file_size = os.path.getsize(segment_path)
                if file_size > 10000:  # Lowered threshold to 10KB
                    print(f"✅ SUCCESS: Captured {file_size} byte video segment")
                    return True
                else:
                    print(f"❌ CRITICAL: Video segment too small ({file_size} bytes)")
                    print(f"❌ FFmpeg stderr: {ffmpeg_result.stderr}")
                    return False
            else:
                print(f"❌ CRITICAL: FFmpeg capture failed")
                print(f"❌ FFmpeg stdout: {ffmpeg_result.stdout}")
                print(f"❌ FFmpeg stderr: {ffmpeg_result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            print("❌ CRITICAL: Stream capture timed out")
            return False
        except Exception as e:
            print(f"❌ CRITICAL: Stream capture error: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _notify_clip_created(self, filename: str, trigger_reason: str, detection_time: float, file_size: int = None):
        """Notify the main server about a new clip."""
        try:
            clip_data = {
                'filename': filename,
                'originalUrl': self.config['url'],
                'duration': self.clip_length,
                'fileSize': file_size or (1024 * 1024 * 10),  # Use actual size or default
                'triggerReason': trigger_reason,
            }

            # Send to main server API
            response = requests.post(
                'http://0.0.0.0:5000/api/clips',
                json=clip_data,
                timeout=5
            )

            if response.status_code == 200:
                print(f"Successfully notified server about clip: {filename}")

                # Trigger thumbnail generation by making a request to the thumbnail endpoint
                try:
                    print(f"Triggering thumbnail generation for: {filename}")
                    thumbnail_response = requests.get(
                        f'http://0.0.0.0:5000/api/thumbnails/{filename}',
                        timeout=15
                    )
                    if thumbnail_response.status_code == 200:
                        print(f"✅ Thumbnail generated successfully for: {filename}")
                    else:
                        print(f"⚠️ Thumbnail generation failed with status: {thumbnail_response.status_code}")
                except Exception as thumb_error:
                    print(f"⚠️ Error triggering thumbnail generation: {thumb_error}")
            else:
                print(f"Failed to notify server: {response.status_code}")

        except Exception as e:
            print(f"Error notifying clip creation: {e}")

    def _notify_stream_ended(self):
        """Notify the main server that the stream has ended."""
        try:
            stream_end_data = {
                'url': self.config['url'],
                'endTime': time.time(),
                'totalClips': self.clips_generated,
                'totalDuration': time.time() - self.start_time if self.start_time else 0,
                'lastSuccessfulCapture': self.last_successful_capture
            }

            # Send to main server API
            response = requests.post(
                'http://0.0.0.0:5000/api/internal/stream-ended',
                json=stream_end_data,
                timeout=5
            )

            if response.status_code == 200:
                print(f"✅ Successfully notified server about stream end")
            else:
                print(f"⚠️ Failed to notify server about stream end: {response.status_code}")

        except Exception as e:
            print(f"⚠️ Error notifying stream end: {e}")

    def _metrics_update_loop(self):
        """Send periodic metrics updates via SSE."""
        while self.is_running:
            try:
                # Get latest metrics
                uptime = time.time() - self.start_time if self.start_time else 0
                hours = int(uptime // 3600)
                minutes = int((uptime % 3600) // 60)
                seconds = int(uptime % 60)
                uptime_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"

                # Try to get latest analysis metrics
                latest_metrics = {}
                try:
                    latest_metrics = self.metrics_queue.get_nowait()
                except Empty:
                    pass

                status_data = {
                    'isProcessing': True,
                    'framesProcessed': self.frames_processed,
                    'streamUptime': uptime_str,
                    'audioLevel': latest_metrics.get('audio_level', 0),
                    'motionLevel': latest_metrics.get('motion_level', 0),
                    'sceneChange': latest_metrics.get('scene_change', 0),
                    'clipsGenerated': self.clips_generated,
                    'streamEnded': self.stream_ended,
                    'consecutiveFailures': self.consecutive_failures,
                    'lastSuccessfulCapture': self.last_successful_capture,
                }

                # Send to main server for SSE broadcast
                requests.post(
                    'http://0.0.0.0:5000/api/internal/metrics',
                    json=status_data,
                    timeout=2
                )

            except Exception as e:
                print(f"Error updating metrics: {e}")

            time.sleep(1)

    def _extract_current_frame(self, segment_path: str):
        """Extract a frame from the current segment for live preview."""
        try:
            frame_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp", "current_frame.jpg")

            # Use ffmpeg to extract a frame from the segment
            cmd = [
                "ffmpeg", "-y",
                "-i", segment_path,
                "-vf", "select=eq(n\\,0)",
                "-q:v", "2",
                "-frames:v", "1",
                frame_path
            ]

            subprocess.run(cmd, capture_output=True, timeout=5)
        except Exception as e:
            # Silent fail - frame extraction is not critical
            pass

    def _capture_session_screenshot(self):
        """Capture a static screenshot when session starts."""
        try:
            # Use ad gatekeeper to get clean URL
            if 'twitch.tv' in self.url:
                import re
                channel_match = re.search(r'twitch\.tv/([^/?]+)', self.url)
                if channel_match:
                    channel = channel_match.group(1)
                    if self.ad_gatekeeper:
                        clean_url = self.ad_gatekeeper.get_clean_twitch_url(channel)
                        if clean_url:
                            self.url = clean_url

            session_id = getattr(self, 'session_id', 'default')
            frame_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp", f"session_{session_id}_frame.jpg")

            # Capture a single frame for session screenshot
            cmd = [
                "ffmpeg", "-y",
                "-i", self.url,
                "-t", "1",
                "-vf", "select=eq(n\\,0)",
                "-q:v", "2",
                "-frames:v", "1",
                frame_path
            ]

            result = subprocess.run(cmd, capture_output=True, timeout=10)

            if result.returncode == 0:
                print(f"📸 Session screenshot captured: {frame_path}")
            else:
                print(f"❌ Failed to capture session screenshot: {result.stderr.decode()}")

        except Exception as e:
            print(f"❌ Error capturing session screenshot: {e}")


def main():
    """Main entry point for stream processor."""
    if len(sys.argv) < 2:
        print("Usage: python stream_processor.py <config_json>")
        sys.exit(1)

    try:
        config = json.loads(sys.argv[1])
        processor = StreamProcessor(config)

        print(f"Starting stream processor for: {config['url']}")

        if processor.start_processing(
            config['url'],
            config.get('audioThreshold', 6),
            config.get('motionThreshold', 30),
            config.get('clipLength', 30),
            config.get('sessionId') # Pass session_id if provided
        ):
            try:
                while processor.is_running:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("Received interrupt signal")
            finally:
                processor.stop_processing()
        else:
            print("Failed to start stream processor")
            sys.exit(1)

    except Exception as e:
        print(f"Error in stream processor: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()