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
import { apiRequest } from "@/lib/queryClient";

// URL validation function for supported streaming platforms
const isValidStreamUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // YouTube validation
    if (hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'youtu.be') {
      if (hostname === 'youtu.be') return true;
      return urlObj.pathname === '/watch' && urlObj.searchParams.has('v');
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

interface StreamInputFormProps {
  sessionId: string | null;
}

export default function StreamInputForm({ sessionId }: StreamInputFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["/api/status", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const response = await apiRequest("GET", `/api/status?sessionId=${sessionId}`);
      return response.json();
    },
    enabled: !!sessionId,
    refetchInterval: 1000,
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
      const response = await apiRequest("POST", "/api/start", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Stream Capture Started",
        description: "Now monitoring stream for highlights",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/status", sessionId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start stream capture",
        variant: "destructive",
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No session ID');
      const response = await apiRequest("POST", "/api/stop", { sessionId });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Stream Capture Stopped",
        description: "Stream monitoring has been stopped",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/status", sessionId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to stop stream capture",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: StreamConfig) => {
    if (status?.isProcessing) {
      stopMutation.mutate();
    } else {
      // Additional validation check before starting
      if (!isValidStreamUrl(data.url)) {
        toast({
          title: "Invalid URL",
          description: "Please enter a valid YouTube, Twitch, or Kick stream URL",
          variant: "destructive",
        });
        return;
      }
      startMutation.mutate(data);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-600 mb-6">
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
                        disabled={status?.isProcessing}
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
                    disabled={status?.isProcessing}
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
                type="submit"
                className={
                  status?.isProcessing
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }
                disabled={startMutation.isPending || stopMutation.isPending}
              >
                {status?.isProcessing ? (
                  <>
                    <Square size={16} className="mr-2" />
                    Stop Clipping
                  </>
                ) : (
                  <>
                    <Play size={16} className="mr-2" />
                    Start Clipping
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