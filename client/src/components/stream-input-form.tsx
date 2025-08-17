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
    <Card className="bg-card border-border mb-6">
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-card-foreground">Stream URL</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="Paste any live stream URL (YouTube, Twitch, Kick, etc.)"
                        className="bg-input border-border text-card-foreground placeholder-muted-foreground focus:ring-primary focus:border-primary"
                        {...field}
                        disabled={status?.isProcessing}
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
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
                  <FormLabel className="text-card-foreground">Clip Duration</FormLabel>
                  <Select
                    value={field.value.toString()}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    disabled={status?.isProcessing}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-input border-border text-card-foreground">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="10" className="text-popover-foreground">10 seconds</SelectItem>
                      <SelectItem value="15" className="text-popover-foreground">15 seconds</SelectItem>
                      <SelectItem value="20" className="text-popover-foreground">20 seconds</SelectItem>
                      <SelectItem value="30" className="text-popover-foreground">30 seconds</SelectItem>
                      <SelectItem value="45" className="text-popover-foreground">45 seconds</SelectItem>
                      <SelectItem value="60" className="text-popover-foreground">60 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
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
                    ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                }
                disabled={startMutation.isPending || stopMutation.isPending}
              >
                {status?.isProcessing ? (
                  <>
                    <Square size={16} className="mr-2" />
                    Stop Monitoring
                  </>
                ) : (
                  <>
                    <Play size={16} className="mr-2" />
                    Start Monitoring
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