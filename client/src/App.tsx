import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import StreamCapture from "@/pages/stream-capture";
import ClipLibrary from "@/pages/clip-library";
import Landing from "@/pages/landing";
import Sidebar from "@/components/sidebar";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/app">
        <div className="flex h-screen bg-slate-900">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Switch>
              <Route path="/app" component={StreamCapture} />
              <Route path="/app/clips" component={ClipLibrary} />
              <Route component={NotFound} />
            </Switch>
          </div>
        </div>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
