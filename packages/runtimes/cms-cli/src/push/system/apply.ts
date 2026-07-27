import type { SystemPayload } from "./scan";
import type { TPageRef, TSystem } from "@bernouy/cms-content";
import { pageRefToString } from "@bernouy/cms-content";

const HEADERS_JSON = (token: string) => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
});

type RemoteSystem = {
    site: Record<string, unknown>;
    editor: Record<string, unknown>;
    auth?: NonNullable<TSystem["auth"]>;
    theme?: TSystem["theme"];
};

/** GET the current system snapshot (settings endpoint exposes the full record). */
export async function fetchRemoteSystem(adminBase: URL, token: string): Promise<RemoteSystem> {
    const url = new URL("api/system/settings", adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) {
        throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    const data = (await res.json()) as Partial<RemoteSystem>;
    return {
        site: data.site ?? {},
        editor: data.editor ?? {},
        auth: data.auth ?? { signupLegalDocuments: [] },
        theme: data.theme,
    };
}

/**
 * Restrict the remote snapshot to the keys actually set in the local
 * payload. We only push (and only diff against) what the user explicitly
 * declared on disk — everything else is left untouched server-side.
 */
export function projectRemote(local: SystemPayload, remote: RemoteSystem): SystemPayload {
    const site: Record<string, unknown> = {};
    const editor: Record<string, unknown> = {};
    for (const k of Object.keys(local.site)) {
        site[k] = remote.site[k];
    }
    for (const k of Object.keys(local.editor)) {
        editor[k] = remote.editor[k];
    }
    return {
        site: site as SystemPayload["site"],
        editor: editor as SystemPayload["editor"],
        ...(local.auth !== undefined ? { auth: remote.auth ?? { signupLegalDocuments: [] } } : {}),
        ...(local.theme ? { theme: remote.theme } : {}),
    };
}

/** Flat-dotted shape expected by `parseSettingsUpdateDto`. */
export function flatten(payload: SystemPayload): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload.site)) {
        if (k === "notFound" || k === "forbidden" || k === "serverError" || k === "login") {
            body[`site.${k}`] = pageRefToString(v as TPageRef);
        } else if (typeof v === "string") {
            body[`site.${k}`] = v;
        }
    }
    for (const [k, v] of Object.entries(payload.editor)) {
        if (typeof v === "string") {
            body[`editor.${k}`] = v;
        }
    }
    if (payload.auth !== undefined) {
        body["auth.signupLegalDocuments"] = payload.auth.signupLegalDocuments;
    }
    if (payload.theme) {
        body.theme = payload.theme;
    }
    return body;
}

export async function postSystem(adminBase: URL, token: string, body: Record<string, unknown>): Promise<void> {
    const url = new URL("api/system/settings", adminBase).href;
    const res = await fetch(url, {
        method: "POST",
        headers: HEADERS_JSON(token),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`POST ${url} → HTTP ${res.status}${text ? ` — ${text}` : ""}`);
    }
}
