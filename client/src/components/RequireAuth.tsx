import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const res = await fetch("/api/user", { credentials: "include" });
      if (!res.ok) throw new Error("Not authenticated");
      return await res.json();
    },
  });

  useEffect(() => {
    if (!isLoading && error) {
      window.location.href = "/signin";
    }
  }, [isLoading, error]);

  if (isLoading) return <div className="text-center text-white">Loading...</div>;
  if (error) return null;
  return <>{children}</>;
}
