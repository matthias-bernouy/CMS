import type { TDataMockup } from "src/socle/interfaces/Data/data";
import type { LocalMockup } from "./scan";

const HEADERS_JSON = (token: string) => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type":  "application/json",
});
const HEADERS_AUTH = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type RemoteMockup = TDataMockup;

export async function fetchRemoteMockups(adminBase: URL, token: string, providerId: string): Promise<RemoteMockup[]> {
    const url = new URL(`api/data/provider/mockup/list?id=${encodeURIComponent(providerId)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS_AUTH(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as RemoteMockup[];
}

export async function postMockup(adminBase: URL, token: string, m: LocalMockup): Promise<void> {
    const url = new URL("api/data/provider/mockup", adminBase).href;
    const res = await fetch(url, {
        method:  "POST",
        headers: HEADERS_JSON(token),
        body:    JSON.stringify({
            providerId: m.providerId,
            method:     m.method,
            path:       m.path,
            name:       m.name,
            status:     m.status,
            body:       m.body,
        }),
    });
    if (!res.ok) throw await httpError("POST", url, res);
}

export async function putMockup(adminBase: URL, token: string, m: LocalMockup): Promise<void> {
    const params = new URLSearchParams({
        id:     m.providerId,
        method: m.method,
        path:   m.path,
        name:   m.name,
    });
    const url = new URL(`api/data/provider/mockup?${params}`, adminBase).href;
    const res = await fetch(url, {
        method:  "PUT",
        headers: HEADERS_JSON(token),
        body:    JSON.stringify({ status: m.status, body: m.body }),
    });
    if (!res.ok) throw await httpError("PUT", url, res);
}

export async function deleteMockup(adminBase: URL, token: string, providerId: string, method: string, path: string, name: string): Promise<void> {
    const params = new URLSearchParams({ id: providerId, method, path, name });
    const url = new URL(`api/data/provider/mockup?${params}`, adminBase).href;
    const res = await fetch(url, { method: "DELETE", headers: HEADERS_AUTH(token) });
    if (!res.ok) throw await httpError("DELETE", url, res);
}

export async function setActive(adminBase: URL, token: string, providerId: string, method: string, path: string, name: string | null): Promise<void> {
    const params = new URLSearchParams({ id: providerId, method, path, name: name ?? "" });
    const url = new URL(`api/data/provider/mockup/active?${params}`, adminBase).href;
    const res = await fetch(url, { method: "POST", headers: HEADERS_AUTH(token) });
    if (!res.ok) throw await httpError("POST", url, res);
}

async function httpError(verb: string, url: string, res: Response): Promise<Error> {
    const text = await res.text().catch(() => "");
    return new Error(`${verb} ${url} → HTTP ${res.status}${text ? ` — ${text}` : ""}`);
}
