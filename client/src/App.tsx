import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import StreamCapture from "@/pages/stream-capture";
import SessionsDashboard from "@/pages/sessions-dashboard";
import ClipLibrary from "@/pages/clip-library";
import Landing from "@/pages/landing";
import SignUp from "@/pages/signup";
import SignIn from "@/pages/signin";
import Sidebar from "@/components/sidebar";
import { SessionProvider } from "@/providers/session-provider";
import RequireAuth from "@/components/RequireAuth";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/signup" component={SignUp} />
      <Route path="/signin" component={SignIn} />
      <Route path="/sessions">
        <SessionsDashboard />
      </Route>
      <Route path="/capture">
        <RequireAuth>
          <div className="flex h-screen bg-slate-900">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Switch>
                <Route path="/capture" component={StreamCapture} />
                <Route path="/capture/clips" component={ClipLibrary} />
                <Route component={NotFound} />
              </Switch>
            </div>
          </div>
        </RequireAuth>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

export default App;