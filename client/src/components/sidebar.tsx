import { Link, useLocation } from "wouter";
import { Video, Library, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const [location] = useLocation();

  const { data: status } = useQuery({
    queryKey: ["/api/status"],
    refetchInterval: 1000,
  });

  const navItems = [
    {
      name: "Stream Capture",
      path: "/capture",
      icon: Video,
    },
    {
      name: "Clip Library",
      path: "/capture/clips",
      icon: Library,
    },
  ];

  return (
    <div className="w-64 bg-slate-800 border-r border-slate-600 flex flex-col">
      {/* Logo/Header */}
      <div className="p-6 border-b border-slate-600">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-50">Clip Live</h1>
            <p className="text-xs text-slate-400">Real-Time Highlights</p>
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
                  "flex items-center space-x-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                )}
              >
                <Icon size={20} />
                <span className="font-medium">{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Status */}
      <div className="p-4 border-t border-slate-600">
        <div className="text-xs text-slate-400 space-y-1">
          <div>Status: {status?.isProcessing ? "Processing" : "Idle"}</div>
          <div>Clips: {status?.clipCount || 0}</div>
          <div>Uptime: {status?.streamUptime || "00:00:00"}</div>
        </div>
      </div>
    </div>
  );
}