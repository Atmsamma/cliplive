import { Link, useLocation } from "wouter";
import { Video, Film, Settings } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const [location] = useLocation();
  
  const { data: status } = useQuery({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
  });

  const { data: clips = [] } = useQuery({
    queryKey: ["/api/clips"],
    refetchInterval: 5000,
  });

  const navItems = [
    {
      path: "/",
      label: "Stream Capture",
      icon: Video,
    },
    {
      path: "/clips",
      label: "Clip Library",
      icon: Film,
      badge: clips.length,
    },
    {
      path: "/settings",
      label: "Settings",
      icon: Settings,
    },
  ];

  return (
    <div className="w-64 bg-slate-800 border-r border-slate-600 flex flex-col">
      {/* Logo/Header */}
      <div className="p-6 border-b border-slate-600">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Video className="text-white" size={16} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-50">Stream Clipper</h1>
            <p className="text-xs text-slate-400">Highlight Capture</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          
          return (
            <Link key={item.path} href={item.path} asChild>
              <div
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer",
                  isActive
                    ? "bg-blue-500 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                )}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="ml-auto bg-slate-600 text-xs px-2 py-1 rounded-full">
                    {item.badge}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Status Indicator */}
      <div className="p-4 border-t border-slate-600">
        <div className="flex items-center space-x-3 text-sm">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              status?.isProcessing
                ? "bg-emerald-500 animate-pulse"
                : "bg-red-500"
            )}
          />
          <span className="text-slate-400">
            {status?.isProcessing ? "Processing" : "Processing Stopped"}
          </span>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          <div>Frames: {status?.framesProcessed || 0}</div>
          <div>Uptime: {status?.streamUptime || "00:00:00"}</div>
        </div>
      </div>
    </div>
  );
}
