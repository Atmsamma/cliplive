import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Link, Play, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/use-session";

// URL validation function for supported streaming platforms
const isValidStreamUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // YouTube validation
    if (hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'youtu.be') {
      if (hostname === 'youtu.be') return true;
    // Accept /watch?v=... and /live/{id}
    if (urlObj.pathname === '/watch' && urlObj.searchParams.has('v')) return true;
    const liveMatch = urlObj.pathname.match(/^\/live\/([A-Za-z0-9_-]+)$/);
    if (liveMatch) return true;
    return false;
    }
    
    // Twitch validation
    if (hostname === 'www.twitch.tv' || hostname === 'twitch.tv') {
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      return pathParts.length >= 1 && pathParts[0] !== '';
    }
    
    // Kick validation
    if (hostname === 'www.kick.com' || hostname === 'kick.com') {
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      return pathParts.length >= 1 && pathParts[0] !== '';
    }
    
    return false;
  } catch {
    return false;
  }
};

const streamConfigSchema = z.object({
  url: z.string()
    .url("Please enter a valid URL")
    .refine(isValidStreamUrl, "Please enter a valid YouTube, Twitch, or Kick stream URL"),
  clipLength: z.number().default(20),
});

type StreamConfig = z.infer<typeof streamConfigSchema>;

import type { RefObject } from "react";
interface Props { sessionId?: string; compact?: boolean; liveProcessingSectionRef?: RefObject<HTMLElement>; scrollContainerRef?: RefObject<HTMLDivElement>; }
export default function StreamInputForm({ sessionId: propSessionId, compact, liveProcessingSectionRef, scrollContainerRef }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sessionId: ctxSessionId, isSessionReady, refreshSession } = useSession();
  const sessionId = propSessionId || ctxSessionId;

  const { data: session } = useQuery({
    queryKey: ['session', sessionId, 'status'],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID available');
  const response = await fetch(`/api/sessions/${sessionId}/status`, { credentials: 'include' });
  if (!response.ok) throw new Error('Failed to fetch session status');
  return response.json();
    },
    refetchInterval: 1000,
    enabled: isSessionReady && !!sessionId,
  });

  const form = useForm<StreamConfig>({
    resolver: zodResolver(streamConfigSchema),
    defaultValues: {
      url: "",
      clipLength: 20,
    },
  });

  const startMutation = useMutation({
    mutationFn: async (data: StreamConfig) => {
  const attemptStart = async (sid: string, attempt: number): Promise<any> => {
        const res = await fetch(`/api/sessions/${sid}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          credentials: 'include'
        });
        let body: any = null;
        try { body = await res.json(); } catch {}
        if (!res.ok) {
          const msg = (body && (body.error || body.message)) ? (body.error || body.message) : `HTTP ${res.status}`;
          const status = res.status;
          const looksLikeStale = (status === 400 || status === 404) && /session not found/i.test(msg);
          if (looksLikeStale && attempt === 0) {
            console.warn('[start] Detected stale session id', sid, '=> refreshing and retrying');
            const newSid = await refreshSession();
            if (!newSid) throw new Error('Session not found and failed to refresh session');
            sessionStorage.setItem('sessionId', newSid);
            return attemptStart(newSid, 1);
          }
          throw new Error(msg);
        }
        return body;
      };

      // Wait briefly for provider to finish verification/creation to avoid duplicate POSTs
      const waitForReady = async (): Promise<string> => {
        const start = Date.now();
        while (Date.now() - start < 2000) { // wait up to 2s
          if (isSessionReady && sessionId) return sessionId;
          await new Promise(r => setTimeout(r, 100));
        }
        // If still not ready, force refresh (will POST once)
        const newSid = await refreshSession();
        if (!newSid) throw new Error('Failed to establish session');
        return newSid;
      };

      let sid = sessionId;
      if (!sid || !isSessionReady) {
        sid = await waitForReady();
      }

      // Preflight status check; if 404 refresh once
      try {
  const statusRes = await fetch(`/api/sessions/${sid}/status`, { credentials: 'include' });
        if (statusRes.status === 404) {
          console.warn('[start] Preflight 404 for session', sid, '-> refreshing');
          const newSid = await refreshSession();
          if (newSid) sid = newSid; else throw new Error('Session not found and refresh failed');
        }
      } catch (e) {
        console.warn('[start] Preflight status check error (continuing):', e);
      }

      return attemptStart(sid, 0);
    },
    onSuccess: (_data, _vars, context) => {
      const sid = context?.sid || sessionId;
      queryClient.invalidateQueries({ queryKey: ['session', sid, 'status'] });
    },
    onError: (error: any) => {
      toast({ title: 'Could not start', description: error?.message ?? 'Unknown', variant: 'destructive' });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No session available');
      const response = await fetch(`/api/sessions/${sessionId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      return response.json();
    },
    onSuccess: (_data, _vars, context) => {
      const sid = context?.sid || sessionId;
      queryClient.invalidateQueries({ queryKey: ['session', sid, 'status'] });
    },
    onError: (e) => {
      toast({ title: 'Could not stop', description: e?.message ?? 'Unknown', variant: 'destructive' });
    },
  });

  // Start in a brand new session without affecting current running one
  const onSubmit = (data: StreamConfig) => {
    const isProcessing = session?.status === 'running';
    if (isProcessing) {
      stopMutation.mutate();
      return;
    }
    if (!isValidStreamUrl(data.url)) {
      console.warn('[stream] invalid URL provided');
      return;
    }
    startMutation.mutate(data);
    // Snap to Live Processing section using scrollIntoView (centered, after short delay)
    if (liveProcessingSectionRef?.current) {
      setTimeout(() => {
        liveProcessingSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  return (
    <Card className={compact ? "bg-slate-700 border-slate-600" : "bg-slate-800 border-slate-600 mb-6"}>
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Stream URL</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="https://www.twitch.tv/username, https://youtube.com/watch?v=..., or https://kick.com/username"
                        className="bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400 focus:ring-blue-500 focus:border-blue-500"
                        {...field}
                        disabled={session?.status === 'running'}
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-slate-400">
                    Supports YouTube, Twitch, and Kick streams - processed in real-time
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="clipLength"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Clip Length</FormLabel>
                  <Select
                    value={field.value.toString()}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    disabled={session?.status === 'running'}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="10" className="text-slate-100">10 seconds</SelectItem>
                      <SelectItem value="15" className="text-slate-100">15 seconds</SelectItem>
                      <SelectItem value="20" className="text-slate-100">20 seconds</SelectItem>
                      <SelectItem value="30" className="text-slate-100">30 seconds</SelectItem>
                      <SelectItem value="45" className="text-slate-100">45 seconds</SelectItem>
                      <SelectItem value="60" className="text-slate-100">60 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-400">
                    System watches the stream in real-time and automatically clips highlights as they happen
                  </p>
                </FormItem>
              )}
            />

            <div className="flex space-x-3">
              <Button
                type={session?.status === 'running' ? 'button' : 'submit'}
                onClick={session?.status === 'running' ? () => stopMutation.mutate() : undefined}
                className={
                  session?.status === 'running'
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }
                disabled={startMutation.isPending || stopMutation.isPending}
                style={!isSessionReady && sessionId ? { opacity: 0.8 } : undefined}
              >
                {session?.status === 'running' ? (
                  <>
                    <Square size={16} className="mr-2" />
                    Stop Clipping
                  </>
                ) : (
                  <>
                    <Play size={16} className="mr-2" />
                    {(!isSessionReady && sessionId) ? 'Start Clipping (Init...)' : 'Start Clipping'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}