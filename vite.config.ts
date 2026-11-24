import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: { host: "::", port: 8080, hmr: { overlay: false } },
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    rollupOptions: {
      output: {
        // No chunk for the charting library: named here, it was downloaded on every page.
        // Left alone, it loads only with the two pages that draw charts.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js", "@tanstack/react-query"],
        },
      },
    },
  },
});
