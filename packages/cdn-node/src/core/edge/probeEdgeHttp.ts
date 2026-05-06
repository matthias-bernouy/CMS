import type { Edge } from "../../interfaces/entities/Edge";
import type { ProbeContext } from "./probeEdge";

export type HttpProbeResult = {
    ok:     boolean;
    status: number | null;
    error:  string | null;
};

/**
 * HTTP probe: GET `https://${edge.hostname}/`, treat `< 500` as healthy
 * (the apex returns 200 from the path-based server block; a 404 on a
 * stale alias config still proves nginx is reachable). Network-level
 * errors fail the probe outright. Never throws.
 */
export async function probeEdgeHttp(edge: Edge, ctx: ProbeContext): Promise<HttpProbeResult> {
    const timeoutMs = ctx.timeoutMs ?? 15_000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        const res = await fetch(`https://${edge.hostname}/`, {
            method: "GET",
            redirect: "manual",
            signal: ctrl.signal,
            headers: { "User-Agent": "cdn-origin-edge-probe/1.0" },
        });
        clearTimeout(timer);
        const ok = res.status < 500;
        return {
            ok,
            status: res.status,
            error:  ok ? null : `unexpected status ${res.status}`,
        };
    } catch (err) {
        clearTimeout(timer);
        return {
            ok:     false,
            status: null,
            error:  err instanceof Error ? err.message : String(err),
        };
    }
}
