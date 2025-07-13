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
  audioThreshold: z.number().default(6),
  motionThreshold: z.number().default(30),
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
      audioThreshold: 6,
      motionThreshold: 30,
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
          <span>Stream Configuration</span>
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
                    Supports Twitch, YouTube, Kick, and HLS streams
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="audioThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Audio Threshold</FormLabel>
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
                        <SelectItem value="3" className="text-slate-100">3dB (Sensitive)</SelectItem>
                        <SelectItem value="6" className="text-slate-100">6dB (Default)</SelectItem>
                        <SelectItem value="9" className="text-slate-100">9dB (Conservative)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="motionThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Motion Threshold</FormLabel>
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
                        <SelectItem value="20" className="text-slate-100">20% (Sensitive)</SelectItem>
                        <SelectItem value="30" className="text-slate-100">30% (Default)</SelectItem>
                        <SelectItem value="40" className="text-slate-100">40% (Conservative)</SelectItem>
                      </SelectContent>
                    </Select>
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
                        <SelectItem value="15" className="text-slate-100">15 seconds</SelectItem>
                        <SelectItem value="20" className="text-slate-100">20 seconds</SelectItem>
                        <SelectItem value="30" className="text-slate-100">30 seconds</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

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
