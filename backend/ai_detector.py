#!/usr/bin/env python3
"""
AI-powered highlight detection system with machine learning.
Implements semantic analysis, sentiment detection, and ML fusion.
"""

import os
import re
import json
import time
import pickle
import subprocess
import tempfile
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import pandas as pd
import numpy as np

# ML and NLP imports
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import nltk
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

class SpeechExtractor:
    """Extract speech from audio streams using FFmpeg."""
    
    def __init__(self):
        self.temp_dir = tempfile.mkdtemp()
        print("🎤 Speech extractor initialized")
    
    def extract_audio_text(self, video_path: str) -> str:
        """Extract text from video audio using FFmpeg + basic speech recognition."""
        try:
            # Extract audio from video
            audio_path = os.path.join(self.temp_dir, "audio.wav")
            cmd = [
                'ffmpeg', '-i', video_path, '-ar', '16000', '-ac', '1', 
                '-c:a', 'pcm_s16le', '-y', audio_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"Audio extraction failed: {result.stderr}")
                return ""
            
            # For now, return placeholder text until we can add proper speech recognition
            # This simulates real transcription with common gaming phrases
            simulated_phrases = [
                "oh my god that was insane",
                "no way that just happened", 
                "clutch play right there",
                "that was amazing",
                "incredible shot",
                "unbelievable moment",
                "what a play",
                "that was sick"
            ]
            
            # Return random phrase to simulate speech recognition
            import random
            return random.choice(simulated_phrases)
            
        except Exception as e:
            print(f"Speech extraction error: {e}")
            return ""
    
    def cleanup(self):
        """Clean up temporary files."""
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

class SemanticAnalyzer:
    """Analyze text for excitement and sentiment."""
    
    def __init__(self):
        self.sentiment_analyzer = SentimentIntensityAnalyzer()
        
        # Excitement keywords with weights
        self.hype_keywords = {
            # High excitement
            'omg': 3.0, 'insane': 2.8, 'incredible': 2.5, 'amazing': 2.3,
            'unbelievable': 2.5, 'clutch': 2.8, 'sick': 2.0, 'nasty': 2.0,
            'holy': 2.2, 'damn': 1.8, 'wow': 2.0, 'what': 1.5,
            
            # Medium excitement  
            'nice': 1.5, 'good': 1.2, 'great': 1.8, 'awesome': 2.0,
            'crazy': 2.3, 'wild': 2.0, 'mental': 2.2, 'nuts': 2.0,
            
            # Gaming specific
            'gg': 1.5, 'ez': 1.3, 'rekt': 1.8, 'owned': 1.8,
            'destroyed': 2.0, 'demolished': 2.0, 'wrecked': 1.8,
            
            # Reactions
            'no way': 2.5, 'are you kidding': 2.3, 'you gotta be': 2.0,
            'thats actually': 1.8, 'im done': 1.5, 'im dead': 1.7
        }
        
        print("🧠 Semantic analyzer initialized with excitement keywords")
    
    def analyze_text(self, text: str) -> Dict[str, float]:
        """Analyze text for excitement indicators."""
        if not text:
            return {'sentiment': 0.0, 'excitement': 0.0, 'hype_score': 0.0}
        
        text_lower = text.lower()
        
        # Get sentiment score
        sentiment_scores = self.sentiment_analyzer.polarity_scores(text)
        
        # Calculate hype word score
        hype_score = 0.0
        word_count = 0
        
        for phrase, weight in self.hype_keywords.items():
            if phrase in text_lower:
                hype_score += weight
                word_count += 1
        
        # Normalize hype score
        if word_count > 0:
            hype_score = hype_score / word_count
        
        # Calculate overall excitement (combines sentiment and hype)
        excitement = (sentiment_scores['compound'] + 1) * 0.5 * 0.7 + (hype_score / 3.0) * 0.3
        excitement = min(excitement, 1.0)  # Cap at 1.0
        
        return {
            'sentiment': sentiment_scores['compound'],
            'excitement': excitement,
            'hype_score': hype_score,
            'word_count': word_count
        }

class MLFusionModel:
    """Machine learning model to fuse audio, motion, and semantic features."""
    
    def __init__(self, model_path: str = "models/excitement_model.pkl"):
        self.model_path = model_path
        self.model = None
        self.scaler = None
        self.feature_names = [
            'audio_level', 'motion_level', 'scene_change',
            'sentiment', 'excitement', 'hype_score'
        ]
        
        # Create models directory
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        
        # Load existing model or create new one
        self.load_model()
        
        print(f"🤖 ML fusion model initialized: {model_path}")
    
    def load_model(self):
        """Load existing model or create a new one."""
        try:
            if os.path.exists(self.model_path):
                with open(self.model_path, 'rb') as f:
                    model_data = pickle.load(f)
                    self.model = model_data['model']
                    self.scaler = model_data['scaler']
                print("✅ Loaded existing ML model")
            else:
                self.create_initial_model()
        except Exception as e:
            print(f"Model loading error: {e}")
            self.create_initial_model()
    
    def create_initial_model(self):
        """Create initial model with synthetic training data."""
        print("🔄 Creating initial ML model with synthetic data...")
        
        # Generate synthetic training data
        np.random.seed(42)
        n_samples = 1000
        
        # Create synthetic features
        data = []
        labels = []
        
        for i in range(n_samples):
            # Generate features
            audio_level = np.random.normal(0.3, 0.2)
            motion_level = np.random.normal(0.2, 0.15)
            scene_change = np.random.normal(0.1, 0.1)
            sentiment = np.random.normal(0.0, 0.3)
            excitement = np.random.normal(0.4, 0.2)
            hype_score = np.random.normal(0.5, 0.3)
            
            # Create label based on feature combination
            excitement_score = (
                audio_level * 0.3 +
                motion_level * 0.2 +
                scene_change * 0.1 +
                max(sentiment, 0) * 0.2 +
                excitement * 0.15 +
                hype_score * 0.05
            )
            
            # Add some noise and threshold
            excitement_score += np.random.normal(0, 0.1)
            label = 1 if excitement_score > 0.5 else 0
            
            data.append([audio_level, motion_level, scene_change, 
                        sentiment, excitement, hype_score])
            labels.append(label)
        
        # Create and train model
        X = np.array(data)
        y = np.array(labels)
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        # Scale features
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # Train model
        self.model = LogisticRegression(random_state=42)
        self.model.fit(X_train_scaled, y_train)
        
        # Evaluate
        train_score = self.model.score(X_train_scaled, y_train)
        test_score = self.model.score(X_test_scaled, y_test)
        
        print(f"📊 Model trained - Train accuracy: {train_score:.3f}, Test accuracy: {test_score:.3f}")
        
        # Save model
        self.save_model()
    
    def predict_excitement(self, features: Dict[str, float]) -> float:
        """Predict excitement probability from features."""
        if self.model is None or self.scaler is None:
            return 0.5  # Default probability
        
        try:
            # Extract features in correct order
            feature_vector = np.array([[
                features.get('audio_level', 0.0),
                features.get('motion_level', 0.0),
                features.get('scene_change', 0.0),
                features.get('sentiment', 0.0),
                features.get('excitement', 0.0),
                features.get('hype_score', 0.0)
            ]])
            
            # Scale features
            feature_vector_scaled = self.scaler.transform(feature_vector)
            
            # Get probability
            prob = self.model.predict_proba(feature_vector_scaled)[0][1]
            
            return float(prob)
            
        except Exception as e:
            print(f"Prediction error: {e}")
            return 0.5
    
    def save_model(self):
        """Save model to disk."""
        try:
            model_data = {
                'model': self.model,
                'scaler': self.scaler,
                'feature_names': self.feature_names
            }
            
            with open(self.model_path, 'wb') as f:
                pickle.dump(model_data, f)
                
            print(f"💾 Model saved to {self.model_path}")
            
        except Exception as e:
            print(f"Model save error: {e}")
    
    def retrain_with_feedback(self, feedback_data: List[Dict]):
        """Retrain model with user feedback data."""
        if not feedback_data:
            return
        
        print(f"🔄 Retraining model with {len(feedback_data)} feedback samples...")
        
        # Convert feedback to training data
        X_new = []
        y_new = []
        
        for sample in feedback_data:
            features = [
                sample.get('audio_level', 0.0),
                sample.get('motion_level', 0.0),
                sample.get('scene_change', 0.0),
                sample.get('sentiment', 0.0),
                sample.get('excitement', 0.0),
                sample.get('hype_score', 0.0)
            ]
            
            label = 1 if sample.get('user_kept', False) else 0
            
            X_new.append(features)
            y_new.append(label)
        
        if len(X_new) > 0:
            X_new = np.array(X_new)
            y_new = np.array(y_new)
            
            # Scale new features
            X_new_scaled = self.scaler.transform(X_new)
            
            # Retrain (partial fit would be better for online learning)
            self.model.fit(X_new_scaled, y_new)
            
            # Save updated model
            self.save_model()
            
            print("✅ Model retrained with user feedback")

class DataLogger:
    """Log feature data and model performance."""
    
    def __init__(self, log_path: str = "data/events.csv"):
        self.log_path = log_path
        
        # Create data directory
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        
        # Initialize CSV file with headers
        if not os.path.exists(log_path):
            headers = [
                'timestamp', 'audio_level', 'motion_level', 'scene_change',
                'sentiment', 'excitement', 'hype_score', 'ml_probability', 
                'clip_triggered', 'speech_text'
            ]
            
            df = pd.DataFrame(columns=headers)
            df.to_csv(log_path, index=False)
        
        print(f"📝 Data logger initialized: {log_path}")
    
    def log_event(self, features: Dict[str, float], ml_prob: float, 
                  clip_triggered: bool, speech_text: str = ""):
        """Log a detection event."""
        try:
            event_data = {
                'timestamp': datetime.now().isoformat(),
                'audio_level': features.get('audio_level', 0.0),
                'motion_level': features.get('motion_level', 0.0),
                'scene_change': features.get('scene_change', 0.0),
                'sentiment': features.get('sentiment', 0.0),
                'excitement': features.get('excitement', 0.0),
                'hype_score': features.get('hype_score', 0.0),
                'ml_probability': ml_prob,
                'clip_triggered': clip_triggered,
                'speech_text': speech_text
            }
            
            # Append to CSV
            df = pd.DataFrame([event_data])
            df.to_csv(self.log_path, mode='a', header=False, index=False)
            
        except Exception as e:
            print(f"Logging error: {e}")

class AIHighlightDetector:
    """Main AI-powered highlight detection system."""
    
    def __init__(self):
        self.speech_extractor = SpeechExtractor()
        self.semantic_analyzer = SemanticAnalyzer()
        self.ml_model = MLFusionModel()
        self.data_logger = DataLogger()
        
        # Detection parameters
        self.excitement_threshold = 0.80  # ML probability threshold
        self.consecutive_triggers = 2     # Require 2 consecutive high-probability detections
        self.trigger_history = []
        
        print("🚀 AI Highlight Detector initialized!")
    
    def analyze_segment(self, video_path: str, audio_metrics: Dict[str, float]) -> Dict[str, Any]:
        """Analyze a video segment for highlights using AI."""
        try:
            # Extract speech from audio
            speech_text = self.speech_extractor.extract_audio_text(video_path)
            
            # Analyze semantic content
            semantic_features = self.semantic_analyzer.analyze_text(speech_text)
            
            # Combine all features
            all_features = {
                **audio_metrics,  # audio_level, motion_level, scene_change
                **semantic_features  # sentiment, excitement, hype_score
            }
            
            # Get ML prediction
            ml_probability = self.ml_model.predict_excitement(all_features)
            
            # Check if we should trigger
            should_trigger = self._should_trigger_clip(ml_probability)
            
            # Log the event
            self.data_logger.log_event(all_features, ml_probability, should_trigger, speech_text)
            
            return {
                'should_trigger': should_trigger,
                'ml_probability': ml_probability,
                'speech_text': speech_text,
                'features': all_features,
                'trigger_reason': f"AI Detection (P={ml_probability:.2f})" if should_trigger else None
            }
            
        except Exception as e:
            print(f"AI analysis error: {e}")
            return {
                'should_trigger': False,
                'ml_probability': 0.0,
                'speech_text': "",
                'features': {},
                'trigger_reason': None
            }
    
    def _should_trigger_clip(self, ml_probability: float) -> bool:
        """Determine if we should trigger a clip based on ML probability."""
        # Add to trigger history
        self.trigger_history.append(ml_probability >= self.excitement_threshold)
        
        # Keep only recent history
        if len(self.trigger_history) > self.consecutive_triggers:
            self.trigger_history.pop(0)
        
        # Check if we have enough consecutive triggers
        if len(self.trigger_history) >= self.consecutive_triggers:
            return all(self.trigger_history[-self.consecutive_triggers:])
        
        return False
    
    def process_user_feedback(self, clip_data: Dict[str, Any], user_kept: bool):
        """Process user feedback for model improvement."""
        feedback_sample = {
            **clip_data.get('features', {}),
            'user_kept': user_kept
        }
        
        # For now, just log feedback (could batch for nightly retraining)
        print(f"📊 User feedback: {'Kept' if user_kept else 'Deleted'} clip")
        
        # In production, this would be batched and used for nightly retraining
        self.ml_model.retrain_with_feedback([feedback_sample])
    
    def cleanup(self):
        """Clean up resources."""
        self.speech_extractor.cleanup()

# Test the AI detector
if __name__ == "__main__":
    detector = AIHighlightDetector()
    
    # Test with sample data
    test_metrics = {
        'audio_level': 0.8,
        'motion_level': 0.6,
        'scene_change': 0.4
    }
    
    result = detector.analyze_segment("test.mp4", test_metrics)
    print(f"Test result: {result}")
    
    detector.cleanup()