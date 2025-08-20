
export class StreamService {
  private sessionId: string | null = null;
  private baseUrl = '';

  constructor() {
    this.initializeSession();
  }

  private async initializeSession(): Promise<void> {
    // Check URL params first
    const urlParams = new URLSearchParams(window.location.search);
    let sessionId = urlParams.get('sid');

    if (!sessionId) {
      // Check localStorage
      sessionId = localStorage.getItem('stream_session_id');
    }

    if (!sessionId) {
      // Create new session
      try {
        const response = await fetch('/api/sessions', { method: 'POST' });
        const data = await response.json();
        sessionId = data.sessionId;
        
        // Store in localStorage and update URL
        localStorage.setItem('stream_session_id', sessionId);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('sid', sessionId);
        window.history.replaceState({}, '', newUrl.toString());
      } catch (error) {
        console.error('Failed to create session:', error);
        return;
      }
    }

    this.sessionId = sessionId;
    localStorage.setItem('stream_session_id', sessionId);

    // Ensure URL has session ID
    const currentParams = new URLSearchParams(window.location.search);
    if (currentParams.get('sid') !== sessionId) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('sid', sessionId);
      window.history.replaceState({}, '', newUrl.toString());
    }
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public async startStream(streamUrl: string, audioThreshold: number = 6, motionThreshold: number = 30, clipLength: number = 30) {
    if (!this.sessionId) {
      throw new Error('No session ID available');
    }

    const response = await fetch(`/api/sessions/${this.sessionId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        streamUrl,
        audioThreshold,
        motionThreshold,
        clipLength,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to start stream');
    }

    return response.json();
  }

  public async stopStream() {
    if (!this.sessionId) {
      throw new Error('No session ID available');
    }

    const response = await fetch(`/api/sessions/${this.sessionId}/stop`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to stop stream');
    }

    return response.json();
  }

  public async getSessionStatus() {
    if (!this.sessionId) {
      return null;
    }

    try {
      const response = await fetch(`/api/sessions/${this.sessionId}/status`);
      if (!response.ok) {
        return null;
      }
      return response.json();
    } catch (error) {
      console.error('Failed to get session status:', error);
      return null;
    }
  }

  public async getSessionClips() {
    if (!this.sessionId) {
      return [];
    }

    try {
      const response = await fetch(`/api/sessions/${this.sessionId}/clips`);
      if (!response.ok) {
        return [];
      }
      return response.json();
    } catch (error) {
      console.error('Failed to get session clips:', error);
      return [];
    }
  }

  public getEventStreamUrl(): string {
    if (!this.sessionId) {
      return '/api/events';
    }
    return `/api/sessions/${this.sessionId}/events`;
  }

  public async deleteSession(deleteFiles: boolean = false) {
    if (!this.sessionId) {
      return false;
    }

    try {
      const response = await fetch(`/api/sessions/${this.sessionId}?deleteFiles=${deleteFiles}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        localStorage.removeItem('stream_session_id');
        this.sessionId = null;
        return true;
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
    return false;
  }
}

export const streamService = new StreamService();
