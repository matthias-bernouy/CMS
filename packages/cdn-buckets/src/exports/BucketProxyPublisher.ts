import type { ProxyUpsertInput } from "./BucketsClient";

export type BucketProxyPublisherConfig = {
    /** Broker base URL of the cdn-buckets bucket. Same value the consumer
     *  feeds to `StorageTokenBroker` / `StorageDirectClient` — typically
     *  `https://cdn.example.com/<bucketId>`. No trailing slash required. */
    brokerBaseUrl: string;
    /** Per-bucket credential bearer (the same `bucketCredential` already
     *  held by the consumer for the broker data plane). The credential
     *  carries the bucket scope, so no `bucketId` is sent in the URL. */
    bucketCredential: string;
    fetch?: typeof fetch;
};

/**
 * Bucket-scoped publisher of CMS data-provider proxy rules.
 *
 * Talks to the broker frontier (`POST /api/proxies` / `DELETE /api/proxies`)
 * with the same `bucketCredential` the consumer already uses for the data
 * plane — no service-account JWT, no extra config plumbing. The bucket
 * scope is derived server-side from the credential, so the publisher
 * only needs to pass the proxy payload.
 *
 * Structurally compatible with the CMS's `ProxyPublisher` contract by
 * design — the consumer wires `new BucketProxyPublisher({ ... })` straight
 * into `ControlCms`'s `proxyPublisher` slot.
 */
export class BucketProxyPublisher {

    private readonly _baseUrl:    string;
    private readonly _credential: string;
    private readonly _fetch:      typeof fetch;

    constructor(config: BucketProxyPublisherConfig) {
        this._baseUrl    = config.brokerBaseUrl.replace(/\/+$/, "");
        this._credential = config.bucketCredential;
        this._fetch      = config.fetch ?? globalThis.fetch.bind(globalThis);
    }

    async upsertProxy(input: ProxyUpsertInput): Promise<void> {
        await this._send("POST", "/api/proxies", input);
    }

    async deleteProxy(providerId: string): Promise<void> {
        const params = new URLSearchParams({ providerId });
        await this._send("DELETE", `/api/proxies?${params.toString()}`);
    }

    private async _send(method: string, path: string, body?: unknown): Promise<void> {
        const headers: Record<string, string> = { "Authorization": `Bearer ${this._credential}` };
        if (body !== undefined) headers["Content-Type"] = "application/json";

        const res = await this._fetch(`${this._baseUrl}${path}`, {
            method,
            headers,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            throw new Error(`BucketProxyPublisher ${method} ${path} → ${res.status}${detail ? `: ${detail}` : ""}`);
        }
    }
}
