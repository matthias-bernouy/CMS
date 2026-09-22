import { createRemoteJWKSet } from "jose";

export type OidcMetadata = {
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
};

export class OidcMetadataCache {
    private readonly metadata = new Map<string, Promise<OidcMetadata>>();
    private readonly jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

    constructor(private readonly allowInsecureIssuer: boolean) {}

    acceptsIssuer(issuer: string): boolean {
        return this.allowInsecureIssuer || isHttps(issuer);
    }

    discover(issuer: string): Promise<OidcMetadata> {
        const base = issuer.replace(/\/+$/, "");
        let metadata = this.metadata.get(base);
        if (!metadata) {
            metadata = this.fetchMetadata(base);
            this.metadata.set(base, metadata);
            metadata.catch(() => this.metadata.delete(base));
        }
        return metadata;
    }

    getJwks(uri: string): ReturnType<typeof createRemoteJWKSet> {
        let jwks = this.jwks.get(uri);
        if (!jwks) {
            jwks = createRemoteJWKSet(new URL(uri));
            this.jwks.set(uri, jwks);
        }
        return jwks;
    }

    private async fetchMetadata(base: string): Promise<OidcMetadata> {
        const response = await fetch(`${base}/.well-known/openid-configuration`);
        if (!response.ok) {
            throw new Error(`discovery failed: ${response.status}`);
        }
        if (!this.allowInsecureIssuer && response.url && !isHttps(response.url)) {
            throw new Error("discovery: redirected to a non-https URL");
        }

        const metadata = (await response.json()) as Partial<OidcMetadata>;
        if (!metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.jwks_uri) {
            throw new Error("discovery: missing required endpoints");
        }
        if (!this.allowInsecureIssuer) {
            assertSecureEndpoints(metadata as OidcMetadata);
        }
        return metadata as OidcMetadata;
    }
}

function assertSecureEndpoints(metadata: OidcMetadata): void {
    for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.jwks_uri]) {
        if (!isHttps(endpoint)) {
            throw new Error(`discovery: non-https endpoint rejected (${endpoint})`);
        }
    }
}

function isHttps(url: string): boolean {
    try {
        return new URL(url).protocol === "https:";
    } catch {
        return false;
    }
}
