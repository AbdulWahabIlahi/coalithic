import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { MeResponse } from "@/lib/types";

export const ROLES = ["Corporate Management", "Mine Officer", "Regulator"];

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<MeResponse>("/auth/me"),
    retry: false,
  });
}

// Called right after a successful login — the httpOnly cookie is already set server-side;
// refreshing ["me"] pulls the user + server date info into the cache.
export async function beginSession() {
  await queryClient.invalidateQueries({ queryKey: ["me"] });
}

// Every sign-out control routes through here: the server session ends AND the cached
// data of the previous account is wiped before the next login on this browser.
export async function endSession() {
  try {
    await apiPost("/auth/logout");
  } finally {
    queryClient.clear();
    // Drop the service-worker API/photo caches too — they may hold the previous
    // account's scoped responses.
    if (typeof caches !== "undefined") {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* storage may be unavailable */
      }
    }
  }
}