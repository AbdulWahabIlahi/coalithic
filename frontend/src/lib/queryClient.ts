import { QueryClient } from "@tanstack/react-query";

// Shared client so lib/session can invalidate/clear the same cache main.tsx mounts.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});
