
#!/usr/bin/env python3
"""
FastAPI backend for resolving stream URLs using Streamlink.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import subprocess
import json
import shlex

app = FastAPI()

# Allow the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for Replit
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ResolveReq(BaseModel):
    source_url: str  # e.g., "https://twitch.tv/somechannel"

@app.post("/api/resolve")
def resolve_stream(req: ResolveReq):
    """
    Use streamlink to get a playable URL (HLS .m3u8).
    We use --json so we can parse it safely.
    """
    # NOTE: Use "best" quality. Change if needed.
    cmd = f"streamlink --json {shlex.quote(req.source_url)} best"

    try:
        proc = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=15
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Stream resolve timed out")

    if proc.returncode != 0:
        # Stream offline or URL invalid
        msg = proc.stderr.strip() or "Failed to resolve stream"
        raise HTTPException(status_code=400, detail=msg)

    try:
        data = json.loads(proc.stdout)
        # Streamlink returns a dict of streams; "url" holds the playable URL
        stream_url = data["streams"]["best"]["url"]
    except Exception:
        raise HTTPException(status_code=500, detail="Bad response from Streamlink")

    return {"playback_url": stream_url}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
