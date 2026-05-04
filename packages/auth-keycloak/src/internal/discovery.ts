export type DiscoveryDocument = {
    authorization_endpoint: string;
    token_endpoint: string;
    end_session_endpoint: string;
    jwks_uri: string;
};

/**
 * Lazily fetches and caches the OIDC discovery document
 * (`{issuer}/.well-known/openid-configuration`). On failure the cache is
 * invalidated so the next call retries.
 */
export class Discovery {
    private _promise: Promise<DiscoveryDocument> | null = null;

    constructor(private readonly _issuer: string) {}

    fetch(): Promise<DiscoveryDocument> {
        if (!this._promise) {
            this._promise = globalThis.fetch(`${this._issuer}/.well-known/openid-configuration`)
                .then(async (res) => {
                    if (!res.ok) throw new Error(`Discovery fetch failed (${res.status})`);
                    return (await res.json()) as DiscoveryDocument;
                })
                .catch((e) => {
                    this._promise = null;
                    throw e;
                });
        }
        return this._promise;
    }
}
