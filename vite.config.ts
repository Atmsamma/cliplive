import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ESM-safe __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));

// Export an async config *function* (no top-level await)
export default defineConfig(async () => {
  const plugins = [react(), runtimeErrorOverlay()];

  // Only load Cartographer on Replit and in non-production
  if (process.env.NODE_ENV !== "production" && process.env.REPL_ID) {
    // dynamic import *inside* the function is OK
    const mod = await import("@replit/vite-plugin-cartographer");
    plugins.push(mod.cartographer());
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": resolve(__dirname, "client", "src"),
        "@shared": resolve(__dirname, "shared"),
        "@assets": resolve(__dirname, "attached_assets"),
      },
    },
    root: resolve(__dirname, "client"),
    build: {
      outDir: resolve(__dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
      // Dev proxy only
      proxy:
        process.env.NODE_ENV === "development"
          ? {
              "/api": {
                target: process.env.VITE_API_URL || "http://localhost:5001",
                changeOrigin: true,
                secure: false,
              },
              "/clips": {
                target: process.env.VITE_API_URL || "http://localhost:5001",
                changeOrigin: true,
                secure: false,
              },
            }
          : undefined,
    },
  };
});
