import type { SystemPayload } from "./scan";
import type { TPageRef } from "@bernouy/cms-content";

const HEADERS_JSON = (token: string) => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type":  "application/json",
});

type RemoteSystem = {
    site:   Record<string, unknown>;
    editor: Record<string, unknown>;
};

/** GET the current system snapshot (settings endpoint exposes the full record). */
export async function fetchRemoteSystem(adminBase: URL, token: string): Promise<RemoteSystem> {
    const url = new URL("api/system/settings", adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const data = await res.json() as RemoteSystem;
    return { site: data.site ?? {}, editor: data.editor ?? {} };
}

/**
 * Restrict the remote snapshot to the keys actually set in the local
 * payload. We only push (and only diff against) what the user explicitly
 * declared on disk — everything else is left untouched server-side.
 */
export function projectRemote(local: SystemPayload, remote: RemoteSystem): SystemPayload {
    const site:   Record<string, unknown> = {};
    const editor: Record<string, unknown> = {};
    for (const k of Object.keys(local.site))   site[k]   = remote.site[k];
    for (const k of Object.keys(local.editor)) editor[k] = remote.editor[k];
    return { site: site as SystemPayload["site"], editor: editor as SystemPayload["editor"] };
}

/** Flat-dotted shape expected by `parseSettingsUpdateDto`. */
export function flatten(payload: SystemPayload): Record<string, string> {
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(payload.site)) {
        if (k === "notFound" || k === "serverError") body[`site.${k}`] = pageRefToString(v as TPageRef);
        else if (typeof v === "string")              body[`site.${k}`] = v;
    }
    for (const [k, v] of Object.entries(payload.editor)) {
        if (typeof v === "string") body[`editor.${k}`] = v;
    }
    return body;
}

function pageRefToString(ref: TPageRef | undefined): string {
    return ref && typeof ref === "object" && "path" in ref ? ref.path : "";
}

export async function postSystem(adminBase: URL, token: string, body: Record<string, string>): Promise<void> {
    const url = new URL("api/system/settings", adminBase).href;
    const res = await fetch(url, {
        method:  "POST",
        headers: HEADERS_JSON(token),
        body:    JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`POST ${url} → HTTP ${res.status}${text ? ` — ${text}` : ""}`);
    }
}
