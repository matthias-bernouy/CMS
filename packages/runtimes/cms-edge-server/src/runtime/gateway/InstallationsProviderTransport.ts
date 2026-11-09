import { assertProviderConnectionToken } from "@bernouy/ulvia-providers/installations";

export class InstallationsProviderTransport {
    readonly #endpoint: URL;

    constructor(
        endpoint: string,
        private readonly token: string | (() => Promise<string>),
        private readonly fetcher: typeof fetch = fetch,
        private readonly renewToken?: () => Promise<string>,
    ) {
        if (typeof token === "string") {
            assertProviderConnectionToken(token);
        }
        this.#endpoint = providerEndpoint(endpoint);
    }

    async request(path: string, init: RequestInit = {}): Promise<Response> {
        const headers = new Headers(init.headers);
        headers.delete("host");
        const token = typeof this.token === "string" ? this.token : await this.token();
        assertProviderConnectionToken(token);
        headers.set("authorization", `Bearer ${token}`);
        const send = () =>
            this.fetcher(this.url(path), {
                ...init,
                headers,
                redirect: "manual",
            });
        const response = await send();
        // Authentication rejects before capability execution. Never retry a business refusal
        // or a body which cannot be replayed; capability dispatch itself uses another transport.
        if (response.status !== 401 || !this.renewToken || (init.body !== undefined && typeof init.body !== "string")) {
            return response;
        }
        await response.body?.cancel();
        const renewed = await this.renewToken();
        assertProviderConnectionToken(renewed);
        headers.set("authorization", `Bearer ${renewed}`);
        return send();
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
