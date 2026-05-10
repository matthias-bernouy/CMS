import type { TDataAuth } from "src/socle/interfaces/Data/data";
import type { LocalDataProvider } from "./scan";

const HEADERS_JSON = (token: string) => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type":  "application/json",
});
const HEADERS_AUTH = (token: string) => ({ "Authorization": `Bearer ${token}` });

/** Slim list as returned by `GET /api/data/providers`. */
export type RemoteListItem = { id: string };

export async function fetchRemoteList(adminBase: URL, token: string): Promise<RemoteListItem[]> {
    const url = new URL("api/data/providers", adminBase).href;
    const res = await fetch(url, { headers: HEADERS_AUTH(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as RemoteListItem[];
}

export async function postProvider(adminBase: URL, token: string, p: LocalDataProvider): Promise<void> {
    const url = new URL("api/data/provider", adminBase).href;
    const res = await fetch(url, {
        method:  "POST",
        headers: HEADERS_JSON(token),
        body:    JSON.stringify(toFlatBody(p)),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`POST ${url} → HTTP ${res.status}${text ? ` — ${text}` : ""}`);
    }
}

export async function putProvider(adminBase: URL, token: string, p: LocalDataProvider): Promise<void> {
    const url = new URL(`api/data/provider?id=${encodeURIComponent(p.id)}`, adminBase).href;
    const res = await fetch(url, {
        method:  "PUT",
        headers: HEADERS_JSON(token),
        body:    JSON.stringify(toFlatBody(p)),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`PUT ${url} → HTTP ${res.status}${text ? ` — ${text}` : ""}`);
    }
}

/**
 * Flatten the nested local shape into the dot-keyed body the server-side
 * parser expects.
 *  - `specAuth` (admin-time) stays the nested bearer/headers grammar:
 *    `specAuth.bearer` / `specAuth.headers.<n>.{name,value}`.
 *  - `rules` is serialized as a JSON string (the textarea convention).
 *  - `secrets` flattens to `secrets.<NAME>` flat entries.
 */
function toFlatBody(p: LocalDataProvider): Record<string, string> {
    const body: Record<string, string> = {
        id:        p.id,
        source:    p.source,
        sourceUrl: p.sourceUrl,
        spec:      p.spec,
        rules:     JSON.stringify(p.rules),
    };
    flattenAuth(body, p.specAuth, "specAuth");
    for (const [envName, value] of Object.entries(p.secrets)) {
        body[`secrets.${envName}`] = value;
    }
    return body;
}

function flattenAuth(body: Record<string, string>, auth: TDataAuth, prefix: string): void {
    if (auth.type === "bearer") {
        body[`${prefix}.bearer`] = auth.token;
        return;
    }
    if (auth.type === "headers") {
        for (let i = 0; i < auth.headers.length; i++) {
            const h = auth.headers[i]!;
            body[`${prefix}.headers.${i}.name`]  = h.name;
            body[`${prefix}.headers.${i}.value`] = h.value;
        }
    }
}
