
#!/usr/bin/env python3
"""
Unit tests for the Ad Gatekeeper module.
Tests ad detection logic with sample playlists.
"""

import unittest
from ad_gatekeeper import AdGatekeeper

class TestAdGatekeeper(unittest.TestCase):
    """Test cases for Ad Gatekeeper functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.gatekeeper = AdGatekeeper()
    
    def test_clean_playlist_no_ads(self):
        """Test that clean playlists are not flagged as having ads."""
        clean_playlist = """#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:12345
#EXTINF:2.000,
segment001.ts
#EXTINF:2.000,
segment002.ts
#EXTINF:2.000,
segment003.ts
#EXT-X-ENDLIST
"""
        self.assertFalse(self.gatekeeper.has_ads(clean_playlist))
    
    def test_twitch_stitched_ad_detection(self):
        """Test detection of twitch-stitched-ad markers."""
        ad_playlist = """#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:12345
#EXTINF:2.000,
segment001.ts
#EXTINF:30.000,
twitch-stitched-ad-segment.ts
#EXTINF:2.000,
segment002.ts
#EXT-X-ENDLIST
"""
        self.assertTrue(self.gatekeeper.has_ads(ad_playlist))
    
    def test_twitch_ad_quartile_detection(self):
        """Test detection of twitch-ad-quartile markers."""
        ad_playlist = """#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:12345
#EXTINF:2.000,
segment001.ts
#EXT-X-SCTE35-OUT:START=YES,TIME=30.0
#EXTINF:30.000,
twitch-ad-quartile-segment.ts
#EXT-X-SCTE35-IN
#EXTINF:2.000,
segment002.ts
#EXT-X-ENDLIST
"""
        self.assertTrue(self.gatekeeper.has_ads(ad_playlist))
    
    def test_discontinuity_detection(self):
        """Test detection of EXT-X-DISCONTINUITY markers."""
        discontinuity_playlist = """#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:12345
#EXTINF:2.000,
segment001.ts
#EXT-X-DISCONTINUITY
#EXTINF:2.000,
segment002.ts
#EXTINF:2.000,
segment003.ts
#EXT-X-ENDLIST
"""
        self.assertTrue(self.gatekeeper.has_ads(discontinuity_playlist))
    
    def test_case_insensitive_detection(self):
        """Test that ad detection is case insensitive."""
        case_mixed_playlist = """#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:12345
#EXTINF:2.000,
segment001.ts
#EXTINF:30.000,
TWITCH-STITCHED-AD-segment.ts
#EXTINF:2.000,
segment002.ts
#EXT-X-ENDLIST
"""
        self.assertTrue(self.gatekeeper.has_ads(case_mixed_playlist))
    
    def test_multiple_ad_types(self):
        """Test detection when multiple ad types are present."""
        multi_ad_playlist = """#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:12345
#EXTINF:2.000,
segment001.ts
#EXT-X-DISCONTINUITY
#EXTINF:30.000,
twitch-stitched-ad-segment.ts
#EXTINF:15.000,
twitch-ad-quartile-segment.ts
#EXTINF:2.000,
segment002.ts
#EXT-X-ENDLIST
"""
        self.assertTrue(self.gatekeeper.has_ads(multi_ad_playlist))
    
    def test_empty_playlist(self):
        """Test behavior with empty or invalid playlists."""
        self.assertTrue(self.gatekeeper.has_ads(""))
        self.assertTrue(self.gatekeeper.has_ads(None))
        self.assertTrue(self.gatekeeper.has_ads("invalid content"))
    
    def test_real_world_clean_playlist(self):
        """Test with a realistic clean Twitch playlist."""
        real_clean_playlist = """#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:1234567890
#EXT-X-TWITCH-ELAPSED-SECS:7200.000
#EXT-X-TWITCH-TOTAL-SECS:7202.000
#EXTINF:2.000,
index-0001234567890-AbCd.ts
#EXTINF:2.000,
index-0001234567891-EfGh.ts
#EXTINF:2.000,
index-0001234567892-IjKl.ts
#EXTINF:2.000,
index-0001234567893-MnOp.ts
#EXTINF:2.000,
index-0001234567894-QrSt.ts
"""
        self.assertFalse(self.gatekeeper.has_ads(real_clean_playlist))

if __name__ == "__main__":
    # Run tests
    unittest.main(verbosity=2)
