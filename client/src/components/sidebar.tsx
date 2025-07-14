import { Link, useLocation } from "wouter";
import { 
  SidebarContent, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
  Sidebar as SidebarPrimitive
} from "@/components/ui/sidebar";
import { Video, Library, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const navigation = [
  {
    name: "Stream Capture",
    href: "/",
    icon: Video,
  },
  {
    name: "Clip Library", 
    href: "/clips",
    icon: Library,
  },
];

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
    <SidebarPrimitive className="border-r border-slate-600 bg-slate-800">
      <SidebarHeader className="p-6 border-b border-slate-600">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-50">Clip Live</h1>
            <p className="text-xs text-slate-400">Real-Time Highlights</p>
          </div>
        </div>
      </SidebarHeader>

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
    </SidebarPrimitive>
  );
}