// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    // Prebundle every UI dependency before serving the first screen. Lazy
    // discovery otherwise swaps React's shared chunks during live edits,
    // leaving mounted renderers paired with hooks from a different instance.
    optimizeDeps: {
      include: [
        "react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime",
        "@radix-ui/react-dialog", "@radix-ui/react-alert-dialog", "@radix-ui/react-slot",
        "lucide-react", "sonner", "class-variance-authority", "clsx", "tailwind-merge", "zod",
        "@supabase/supabase-js", "pdf-lib", "@pdf-lib/fontkit",
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
