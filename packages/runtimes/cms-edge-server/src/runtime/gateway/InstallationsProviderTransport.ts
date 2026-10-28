import { assertProviderConnectionToken } from "@bernouy/cms-repository/providers/installations";

export class InstallationsProviderTransport {
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
        const headers = new Headers(init.headers);
        headers.delete("host");
        headers.set("authorization", `Bearer ${this.token}`);
        return this.fetcher(this.url(path), {
            ...init,
            headers,
            redirect: "manual",
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
