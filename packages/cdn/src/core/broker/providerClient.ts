import type { CDNGetItemsOptions } from "@bernouy/core";

/** Typed call to the provider's frontier B. Throws on `{ ok: false }`. */
export async function callProvider<T>(
    providerOrigin: string,
    credentialToken: string,
    method: string,
    path: string,
    body?: unknown,
): Promise<T> {
    const init: RequestInit = { method, headers: { "Authorization": `Bearer ${credentialToken}` } };
    if (body !== undefined) {
        (init.headers as Record<string, string>)["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
    }
    const res = await fetch(`${providerOrigin}${path}`, init);
    const json = await res.json() as { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
    if (!json.ok) throw new Error(`provider_call_failed: ${json.error.code} — ${json.error.message}`);
    return json.data;
}

/** Forwards an inbound frontier A request to the provider's frontier B with
 *  bearer auth re-injected. Body is buffered (`arrayBuffer`) — fine for the
 *  small JSON payloads relayed here; raw uploads bypass the broker. */
export async function proxyRequest(
    providerOrigin: string,
    credentialToken: string,
    req: Request,
    providerPath: string,
): Promise<Response> {
    const url = new URL(req.url);
    const target = `${providerOrigin}${providerPath}${url.search}`;
    const headers = new Headers({ "Authorization": `Bearer ${credentialToken}` });
    const ct = req.headers.get("content-type"); if (ct) headers.set("content-type", ct);
    const init: RequestInit = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer();
    const res = await fetch(target, init);
    return new Response(res.body, { status: res.status, headers: res.headers });
}

export function serializeListOpts(opts: CDNGetItemsOptions): string {
    const p = new URLSearchParams();
    if (opts.folderID)   p.set("folderID",  opts.folderID);
    if (opts.accept)     p.set("accept",    opts.accept.join(","));
    if (opts.search)     p.set("search",    opts.search);
    if (opts.sortBy)     p.set("sortBy",    opts.sortBy);
    if (opts.sortOrder)  p.set("sortOrder", opts.sortOrder);
    if (opts.recursive)  p.set("recursive", "true");
    if (opts.pagination) {
        p.set("page",  String(opts.pagination.page));
        p.set("limit", String(opts.pagination.limit));
    }
    return p.toString();
}
