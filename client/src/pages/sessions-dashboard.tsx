import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';
import { useSession } from '@/hooks/use-session';
import { useLocation } from 'wouter';
import SessionCard from '@/components/session-card';

interface SessionSummary { session_id: string; status?: string; stream_url?: string; }

export default function SessionsDashboard() {
  // Require authentication
  const { isSessionReady } = useSession();
  const [location, setLocation] = useLocation();
  // Redirect to /signin if not authenticated
  useEffect(() => {
    if (!isSessionReady) {
      setLocation('/signin');
    }
  }, [isSessionReady, setLocation]);
  const qc = useQueryClient();
  const { data } = useQuery<{ sessions: SessionSummary[] }>({
    queryKey: ['sessions','list'],
    queryFn: async () => {
      const r = await fetch('/api/sessions');
      return r.json();
    },
    refetchInterval: 3000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/sessions', { method: 'POST' });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions','list'] })
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Sessions</h1>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>New Session</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data?.sessions?.map(s => (
          <SessionCard key={s.session_id} sessionId={s.session_id} />
        ))}
      </div>
    </div>
  );
}
