export type ProxyConfig = {
    publicOrigin: string;
    token: string;
};

/**
 * Forwards a request to the remote CMS with the bearer token injected, then
 * streams the response back to the local client. The token never leaves the
 * CLI process.
 */
export async function proxyRequest(req: Request, target: string, config: ProxyConfig): Promise<Response> {
    const headers = new Headers(req.headers);
    headers.set("Authorization", `Bearer ${config.token}`);
    headers.delete("host");
    headers.delete("connection");
    headers.delete("content-length");

    const body = (req.method === "GET" || req.method === "HEAD")
        ? undefined
        : await req.arrayBuffer();

    let res: Response;
    try {
        res = await fetch(target, {
            method: req.method,
            headers,
            body,
            redirect: "manual",
        });
    } catch (e) {
        console.error(`[proxy] ${req.method} ${target} — ${e instanceof Error ? e.message : e}`);
        return new Response("Bad gateway (proxy error)", { status: 502 });
    }

    // Bun's fetch auto-decompresses, so the Content-Encoding header on the
    // upstream response no longer matches the body we forward. Strip it to
    // avoid the browser trying to inflate an already-inflated payload.
    const outHeaders = new Headers(res.headers);
    outHeaders.delete("content-encoding");
    outHeaders.delete("transfer-encoding");
    outHeaders.delete("content-length");

    return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders,
    });
}
