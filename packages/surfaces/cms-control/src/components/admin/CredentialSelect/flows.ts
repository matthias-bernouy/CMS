import BubblesEvent from "cms-control/core/dom/BubblesEvent";
import { showToast } from "cms-control/core/showToast";

const SAVED_EVENT = "secret:saved";

/**
 * Network helpers for `<cms-credential-select>`. Both endpoints sit
 * behind the admin auth guard already, so no extra credentials needed.
 * On failure we surface a toast — toast for the success cases is the
 * caller's job (user might want different copy depending on context).
 */

export async function fetchKeys(api: string): Promise<string[]> {
    const res = await fetch(`${api}/keys`, { headers: { Accept: "application/json" } });
    if (!res.ok) { showToast("Failed to load credentials", { type: "error" }); return []; }
    return res.json();
}

export async function createCredential(
    api: string,
    key: string,
    value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
    });
    if (res.ok) {
        document.dispatchEvent(new BubblesEvent(SAVED_EVENT));
        return { ok: true };
    }
    let error = `HTTP ${res.status}`;
    try {
        const body = await res.json();
        if (body && typeof body.error === "string") error = body.error;
    } catch { /* not JSON */ }
    return { ok: false, error };
}
