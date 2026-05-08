import { showToast } from "src/control/core/showToast";
import type { SlimEndpoint } from "src/control/core/data/types";

export type ProviderListItem = { id: string; server: string };

/**
 * Network helpers for `<cms-schema-picker>`. All endpoints sit behind
 * the admin auth guard. Failures show a toast — the picker stays
 * functional with whatever it has cached locally.
 */

export async function fetchProviders(api: string): Promise<ProviderListItem[]> {
    const res = await fetch(`${api}/providers`, { headers: { Accept: "application/json" } });
    if (!res.ok) { showToast("Failed to load providers", { type: "error" }); return []; }
    const list = await res.json() as { id: string; server?: string }[];
    return list.map(p => ({
        id:     p.id,
        // Strip trailing slashes so prefix-match against picker values works
        // regardless of how the admin spelled the server URL.
        server: (p.server ?? "").replace(/\/+$/, ""),
    }));
}

export async function fetchEndpoints(api: string, providerId: string): Promise<SlimEndpoint[]> {
    const url = `${api}/provider/endpoints?id=${encodeURIComponent(providerId)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) return [];   // not synced yet — treat as empty silently
    if (!res.ok) { showToast(`Failed to load endpoints for "${providerId}"`, { type: "error" }); return []; }
    return res.json();
}
