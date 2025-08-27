const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// In-memory session store
const sessions = {};

// Create a new session
app.post('/api/sessions', (req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = { status: 'idle', url: null, clipLength: null };
  res.json({ session_id: sessionId });
});

// Get session status
app.get('/api/sessions/:sessionId/status', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ status: session.status, url: session.url, clipLength: session.clipLength });
});

// Start clipping for a session
app.post('/api/sessions/:sessionId/start', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { url, clipLength } = req.body;
  if (!url || !clipLength) return res.status(400).json({ error: 'Missing url or clipLength' });
  session.status = 'running';
  session.url = url;
  session.clipLength = clipLength;
  res.json({ status: 'running' });
});

// Stop clipping for a session
app.post('/api/sessions/:sessionId/stop', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  session.status = 'idle';
  res.json({ status: 'idle' });
});

const PORT = process.env.PORT || 5174;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
