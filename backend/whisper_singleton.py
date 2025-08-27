import whisper
from typing import Optional
from backend.logging_utils import setup_logger

logger = setup_logger(__name__)

class WhisperSingleton:
    """Singleton class for Whisper model to prevent memory leaks."""
    
    _instance: Optional['WhisperSingleton'] = None
    _model = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def get_model(self):
        """Get or load the Whisper model."""
        if self._model is None:
            logger.info("Loading Whisper model (one-time setup)...")
            self._model = whisper.load_model("base")
            logger.info("Whisper model loaded")
        return self._model
    
    def cleanup(self):
        """Clean up the model."""
        self._model = None
