import { buildRequestUrl } from "../../base/buildRequestUrl";

/**
 * Fetch JSON for a dataviz bloc, forwarding the page's query params (e.g. ?range=)
 * via the in-package buildRequestUrl. Returns null on any non-2xx or failure — the
 * caller renders an empty state. Never throws (dataviz must not break the page).
 */
export async function fetchJson(url: string): Promise<unknown> {
    try {
        const res = await fetch(buildRequestUrl(url), { headers: { Accept: "application/json" } });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}
