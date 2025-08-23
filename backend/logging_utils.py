import logging
import os

def setup_logger(name: str) -> logging.Logger:
    """Set up logger with appropriate level based on environment."""
    logger = logging.getLogger(name)
    
    level = logging.DEBUG if os.getenv('DEBUG', '').lower() == 'true' else logging.INFO
    logger.setLevel(level)
    
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter('%(asctime)s [%(name)s] %(levelname)s: %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    
    return logger
