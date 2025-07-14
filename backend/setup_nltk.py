#!/usr/bin/env python3
"""Setup script for NLTK data."""

import nltk
import os

def setup_nltk():
    """Download required NLTK data."""
    try:
        # Set NLTK data path
        nltk_data_dir = os.path.expanduser('~/nltk_data')
        if not os.path.exists(nltk_data_dir):
            os.makedirs(nltk_data_dir)
        
        # Download required datasets
        nltk.download('punkt', quiet=True)
        nltk.download('stopwords', quiet=True)
        nltk.download('vader_lexicon', quiet=True)
        
        print("NLTK data downloaded successfully")
        return True
    except Exception as e:
        print(f"NLTK setup error: {e}")
        return False

if __name__ == "__main__":
    setup_nltk()