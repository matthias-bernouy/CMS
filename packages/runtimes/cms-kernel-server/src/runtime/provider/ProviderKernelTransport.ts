import { assertProviderConnectionToken } from "@bernouy/cms-repository/providers/installations";

const HOP_BY_HOP_HEADERS = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
] as const;

export class ProviderKernelTransport {
    readonly #endpoint: URL;

    constructor(
        endpoint: string,
        private readonly token: string,
        private readonly fetcher: typeof fetch = fetch,
    ) {
        assertProviderConnectionToken(token);
        this.#endpoint = providerEndpoint(endpoint);
    }

    request(path: string, init: RequestInit = {}): Promise<Response> {
        const headers = sanitizedHeaders(init.headers);
        headers.delete("host");
        headers.set("authorization", `Bearer ${this.token}`);
        return this.fetcher(this.url(path), {
            ...init,
            headers,
            redirect: "manual",
        });
    }

    forward(path: string, request: Request, extraHeaders?: HeadersInit, timeoutMs?: number): Promise<Response> {
        const headers = sanitizedHeaders(request.headers);
        headers.delete("host");
        const actorAuthorization = headers.get("authorization");
        for (const [name, value] of sanitizedHeaders(extraHeaders)) {
            headers.set(name, value);
        }
        headers.delete("x-ulvia-actor-authorization");
        headers.delete("x-ulvia-original-origin");
        if (actorAuthorization) {
            headers.set("x-ulvia-actor-authorization", actorAuthorization);
        }
        headers.set("x-ulvia-original-origin", new URL(request.url).origin);
        return this.request(path, {
            method: request.method,
            headers,
            body: request.body,
            signal: timeoutMs ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]) : request.signal,
            ...(request.body ? { duplex: "half" } : {}),
        });
    }

    response(response: Response): Response {
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: sanitizedHeaders(response.headers),
        });
    }

    private url(path: string): URL {
        if (!path.startsWith("/") || path.startsWith("//")) {
            throw new TypeError("Provider request path must be absolute");
        }
        const url = new URL(path, this.#endpoint);
        if (url.origin !== this.#endpoint.origin) {
            throw new TypeError("Provider request must remain on the configured origin");
        }
        return url;
    }
}

function providerEndpoint(endpoint: string): URL {
    const url = new URL(endpoint);
    if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new TypeError("Provider endpoint is invalid");
    }
    return url;
}

function sanitizedHeaders(source?: HeadersInit): Headers {
    const headers = new Headers(source);
    const connectionHeaders = headers.get("connection")?.split(",") ?? [];
    for (const name of HOP_BY_HOP_HEADERS) {
        headers.delete(name);
    }
    for (const name of connectionHeaders) {
        headers.delete(name.trim());
    }
    return headers;
}
