import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Link, Play, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const streamConfigSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
  clipLength: z.number().default(20),
});

type StreamConfig = z.infer<typeof streamConfigSchema>;

export default function StreamInputForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["/api/status"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
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
      const response = await apiRequest("POST", "/api/stop");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Stream Capture Stopped",
        description: "Processing has been stopped",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
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
      startMutation.mutate(data);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-600 mb-6">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2 text-slate-50">
          <Link className="text-blue-400" size={20} />
          <span>Clip Configuration</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
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
                        placeholder="https://www.twitch.tv/username or https://youtube.com/watch?v=..."
                        className="bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400 focus:ring-blue-500 focus:border-blue-500"
                        {...field}
                        disabled={status?.isProcessing}
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-slate-400">
                    Supports Twitch, YouTube, Kick, and HLS streams - processed in real-time
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
                    Stop Capture
                  </>
                ) : (
                  <>
                    <Play size={16} className="mr-2" />
                    Start Capture
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
```

```
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Link, Play, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

// Replacing the StreamInputForm component with the mobile-optimized version
export function StreamInputForm() {
  const [url, setUrl] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setIsProcessing(true)

    try {
      const response = await fetch('/api/process-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!response.ok) {
        throw new Error('Failed to start stream processing')
      }

      toast({
        title: "Stream processing started",
        description: "Clip Live is now watching your stream in real-time and will automatically capture exciting moments.",
      })

      setUrl('')
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start stream processing. Please check the URL and try again.",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg sm:text-xl">Start Real-Time Stream Capture</CardTitle>
        <CardDescription className="text-sm sm:text-base">
          Enter a public stream URL and Clip Live will monitor it in real-time, automatically detecting and clipping exciting moments as they happen.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stream-url" className="text-sm font-medium">Stream URL</Label>
            <Input
              id="stream-url"
              type="url"
              placeholder="https://example.com/stream.m3u8"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isProcessing}
              className="text-sm sm:text-base h-11 sm:h-10"
            />
          </div>
          <Button 
            type="submit" 
            disabled={!url.trim() || isProcessing}
            className="w-full h-11 sm:h-10 text-sm sm:text-base font-medium"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting Real-Time Analysis...
              </>
            ) : (
              'Start Live Capture'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}