// Tiny same-origin API helpers shared by hub-ui components. Every call goes
// to `/api/*` on the same origin; the superadmin cookie is attached natively.

export function queryParam(name: string): string {
    return new URLSearchParams(window.location.search).get(name) || "";
}

/** GET + unwrap the `{ ok, data }` envelope. Returns `data` or null. */
export async function apiGet<T = any>(url: string): Promise<T | null> {
    try {
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        if (!r.ok) return null;
        const j = await r.json();
        return (j?.data ?? null) as T | null;
    } catch { return null; }
}

export type ApiResult = { ok: true } | { ok: false; message: string };

/** Send a JSON body; return ok or a friendly error message. */
export async function apiSend(method: string, url: string, body?: unknown): Promise<ApiResult> {
    try {
        const r = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (r.ok) return { ok: true };
        let message = `HTTP ${r.status}`;
        try { const j = await r.json(); if (j?.error?.message) message = j.error.message; } catch { /* */ }
        return { ok: false, message };
    } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
}
