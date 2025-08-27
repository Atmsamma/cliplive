import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StreamInputForm from './stream-input-form';
import ProcessingStatus from './processing-status';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props { sessionId: string; }

export default function SessionCard({ sessionId }: Props) {
  const qc = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ['session', sessionId, 'status'],
    queryFn: async () => {
      const r = await fetch(`/api/sessions/${sessionId}/status`);
      return r.json();
    },
    refetchInterval: 2000,
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session', sessionId, 'status'] })
  });

  return (
    <Card className="bg-slate-800 border-slate-600">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="text-slate-100 font-medium truncate">{sessionId}</div>
        {status?.status === 'running' && (
          <Button size="sm" variant="destructive" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>Stop</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <StreamInputForm sessionId={sessionId} compact />
        <ProcessingStatus sessionId={sessionId} />
      </CardContent>
    </Card>
  );
}
