import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface SessionContextType {
  sessionId: string | null;
  isSessionReady: boolean;
  clearSession: () => void;
  refreshSession: () => Promise<string | null>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const verifyingRef = useRef(false);
  const creatingRef = useRef(false);
  const restoredRef = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const isLikelyUuid = (value: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
    const SESSION_CREATING_KEY = 'sessionCreatingTs';

    // Helper to see if another mount already kicked off creation very recently (StrictMode double render)
    const isRecentCreationInFlight = () => {
      const ts = sessionStorage.getItem(SESSION_CREATING_KEY);
      if (!ts) return false;
      const age = Date.now() - Number(ts);
      // If older than 15s assume stale and clear
      if (isNaN(age) || age > 15000) {
        sessionStorage.removeItem(SESSION_CREATING_KEY);
        return false;
      }
      return true;
    };

    // Check if there's an existing session in localStorage
    // Clean up legacy key if present to avoid parallel sessions
    if (sessionStorage.getItem('clipLive_sessionId')) {
      sessionStorage.removeItem('clipLive_sessionId');
    }
    const storedSessionId = sessionStorage.getItem('sessionId');
    console.log('Stored session ID:', storedSessionId);

    if (storedSessionId && storedSessionId !== 'undefined' && storedSessionId !== 'null' && isLikelyUuid(storedSessionId)) {
      setSessionId(storedSessionId); // provisional; will verify below only if restored
      restoredRef.current = true;
    } else if (storedSessionId && (storedSessionId === 'undefined' || storedSessionId === 'null' || !isLikelyUuid(storedSessionId))) {
      console.warn('Invalid stored session ID found, clearing and creating a new one:', storedSessionId);
      sessionStorage.removeItem('sessionId');
    }

    const createSession = async () => {
      if (creatingRef.current) return;
      // If another mount already initiated creation, skip and let verification path handle it
      if (isRecentCreationInFlight()) {
        // If a valid sessionId already appeared (other mount finished), skip
        const existing = sessionStorage.getItem('sessionId');
        if (existing && isLikelyUuid(existing)) {
          setSessionId(existing);
          setIsVerified(true);
          restoredRef.current = false;
          return;
        }
        return; // creation still in-flight
      }
      creatingRef.current = true;
      try {
        console.log('Creating new session...');
        sessionStorage.setItem(SESSION_CREATING_KEY, String(Date.now()));
        const response = await apiRequest('POST', '/api/sessions', {}, { credentials: 'include' });
        const session = await response.json();
        if (!session?.session_id || !isLikelyUuid(session.session_id)) {
          throw new Error('Server returned invalid session ID');
        }
        console.log('Session created:', session.session_id);
        // Clear stale queries referencing old session(s)
        queryClient.clear();
        setSessionId(session.session_id);
        sessionStorage.setItem('sessionId', session.session_id);
        setIsVerified(true);
        restoredRef.current = false; // new session, no need to verify
      } catch (error) {
        console.error('Failed to create session:', error);
      } finally {
        // Delay clearing marker slightly so any parallel scheduled create sees it
        setTimeout(() => sessionStorage.removeItem(SESSION_CREATING_KEY), 50);
        creatingRef.current = false;
      }
    };

    // If no valid stored session ID, create immediately
    if (!storedSessionId || !isLikelyUuid(storedSessionId)) {
      // Defer a tick to allow second StrictMode mount to see the inflight marker before issuing POST again
      setTimeout(() => {
        createSession();
      }, 0);
      // Fallback retry after 1s in case first attempt was pre-empted
      setTimeout(() => {
        if (!sessionStorage.getItem('sessionId') && !creatingRef.current) {
          console.log('Retrying session creation (fallback)');
          createSession();
        }
      }, 1000);
    }
  }, [queryClient]);

  // When sessionId changes (newly created), purge any cached queries for other session IDs
  useEffect(() => {
    if (!sessionId) return;
    queryClient.removeQueries({ queryKey: ['session'], exact: false });
  }, [sessionId, queryClient]);

  // Verify existing stored session with backend; if missing, create a new one
  useEffect(() => {
    // Only verify sessions that were restored from storage, not newly created ones
    if (!sessionId || isVerified || verifyingRef.current || !restoredRef.current) return;
    verifyingRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/status`, { credentials: 'include' });
        if (res.status === 404) {
          console.warn('Stored session ID not found on server, creating new session');
          // invalidate old queries that may still be polling
          queryClient.clear();
          if (!cancelled) {
            setSessionId(null);
          }
          // create new
          // Guard against duplicate POSTs caused by StrictMode remount: reuse same key logic
          const SESSION_CREATING_KEY = 'sessionCreatingTs';
          const ts = sessionStorage.getItem(SESSION_CREATING_KEY);
          const ageOk = ts ? (Date.now() - Number(ts)) < 15000 : false;
          if (!ageOk) {
            sessionStorage.setItem(SESSION_CREATING_KEY, String(Date.now()));
            try {
              const createRes = await apiRequest('POST', '/api/sessions', {}, { credentials: 'include' });
              const session = await createRes.json();
              if (!cancelled && session?.session_id) {
                setSessionId(session.session_id);
                sessionStorage.setItem('sessionId', session.session_id);
                setIsVerified(true);
              }
            } finally {
              sessionStorage.removeItem(SESSION_CREATING_KEY);
            }
          } else {
            // Another mount already creating; we'll rely on that to populate sessionStorage
            const retryCheck = () => {
              const newId = sessionStorage.getItem('sessionId');
              if (newId && /^[0-9a-fA-F-]{36}$/.test(newId)) {
                if (!cancelled) {
                  setSessionId(newId);
                  setIsVerified(true);
                }
              } else if (!cancelled) {
                setTimeout(retryCheck, 150);
              }
            };
            retryCheck();
          }
        } else if (res.ok) {
          if (!cancelled) setIsVerified(true);
        } else {
          console.error('Unexpected response verifying session', res.status);
        }
      } catch (e) {
        console.error('Error verifying session ID', e);
      } finally {
        verifyingRef.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [sessionId, isVerified, queryClient]);

  const clearSession = () => {
    sessionStorage.removeItem('sessionId');
    setSessionId(null);
    queryClient.clear();
  };

  const refreshSession = async (): Promise<string | null> => {
    // Force-create a new session (used when backend reports 404)
    try {
      const res = await apiRequest('POST', '/api/sessions', {}, { credentials: 'include' });
      const data = await res.json();
      if (data?.session_id) {
        sessionStorage.setItem('sessionId', data.session_id);
        setSessionId(data.session_id);
        setIsVerified(true);
        return data.session_id;
      }
    } catch (e) {
      console.error('refreshSession failed', e);
    }
    return null;
  };

  return (
    <SessionContext.Provider value={{
      sessionId,
  isSessionReady: sessionId !== null && isVerified,
      clearSession,
  refreshSession,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
