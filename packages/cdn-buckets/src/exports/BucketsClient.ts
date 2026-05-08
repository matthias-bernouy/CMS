import type { Bucket, BucketLimits, BucketQuotas } from "../interfaces/entities/Bucket";
import type { Alias } from "../interfaces/entities/Alias";
import type { StoredFile } from "../interfaces/entities/StoredFile";
import type { StoredFolder } from "../interfaces/entities/StoredFolder";

/**
 * Typed HTTP client for `/admin/api/*` on a `cdn-buckets` instance.
 *
 * Auth = bearer JWT issued by the platform's Keycloak for a service-account
 * client (typically `hub-orchestrator` in the `master` realm, granted the
 * `admin` realm role of the cdn realm). The bearer is forwarded as
 * `Authorization: Bearer <jwt>` and validated server-side by the
 * `KeycloakBearerConsumer` composed in the cdn-buckets admin auth chain.
 *
 * All response shapes type `Date` as `string` (ISO) — JSON wire format
 * doesn't preserve `Date` instances. Parse with `new Date(view.createdAt)`
 * if you need a Date object on the caller side.
 */
export class BucketsClient {

    private readonly _baseUrl: string;
    private readonly _token:   string;
    private readonly _fetch:   typeof fetch;

    constructor(config: { baseUrl: string; token: string; fetch?: typeof fetch }) {
        this._baseUrl = config.baseUrl.replace(/\/+$/, "");
        this._token   = config.token;
        this._fetch   = config.fetch ?? globalThis.fetch.bind(globalThis);
    }

    // ── Buckets ────────────────────────────────────────────────────────

    async listBuckets(): Promise<BucketView[]> {
        return this._json("GET", "/admin/api/buckets/list");
    }

    async getBucket(bucketId: string): Promise<BucketView> {
        return this._json("GET", `/admin/api/buckets?bucketId=${encodeURIComponent(bucketId)}`);
    }

    async createBucket(input: BucketCreateInput): Promise<BucketView> {
        return this._json("POST", "/admin/api/buckets", flattenBucket(input));
    }

    async updateBucket(bucketId: string, input: BucketUpdateInput): Promise<BucketView> {
        return this._json("PATCH", `/admin/api/buckets?bucketId=${encodeURIComponent(bucketId)}`, flattenBucket(input));
    }

    async deleteBucket(bucketId: string): Promise<{ id: string }> {
        return this._json("DELETE", `/admin/api/buckets?bucketId=${encodeURIComponent(bucketId)}`);
    }

    // ── Bucket credentials (per-bucket bearer for the broker surface) ──

    async listBucketCredentials(bucketId: string): Promise<BucketCredentialView[]> {
        return this._json("GET", `/admin/api/credentials/list?bucketId=${encodeURIComponent(bucketId)}`);
    }

    async createBucketCredential(bucketId: string, input: { label?: string; expiresAt?: Date }): Promise<{ credential: BucketCredentialView; cleartextToken: string }> {
        return this._json("POST", `/admin/api/credentials?bucketId=${encodeURIComponent(bucketId)}`, {
            ...(input.label     !== undefined ? { label:     input.label                    } : {}),
            ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt.toISOString() } : {}),
        });
    }

    async updateBucketCredential(id: string, input: { label?: string; expiresAt?: Date | null; revoke?: boolean }): Promise<BucketCredentialView> {
        const body: Record<string, unknown> = {};
        if (input.label     !== undefined) body.label     = input.label;
        if (input.expiresAt !== undefined) body.expiresAt = input.expiresAt === null ? "" : input.expiresAt.toISOString();
        if (input.revoke)                  body.revokedAt = "now";
        return this._json("PATCH", `/admin/api/credentials?id=${encodeURIComponent(id)}`, body);
    }

    async deleteBucketCredential(id: string): Promise<{ id: string }> {
        return this._json("DELETE", `/admin/api/credentials?id=${encodeURIComponent(id)}`);
    }

    // ── Aliases (custom domains pointing to a bucket) ──────────────────

    async listAliases(bucketId: string): Promise<Alias[]> {
        return this._json("GET", `/admin/api/aliases/list?bucketId=${encodeURIComponent(bucketId)}`);
    }

    async createAlias(bucketId: string, input: { domain: string; issueCert?: boolean }): Promise<Alias> {
        return this._json("POST", `/admin/api/aliases?bucketId=${encodeURIComponent(bucketId)}`, {
            domain: input.domain,
            ...(input.issueCert !== undefined ? { issueCert: input.issueCert } : {}),
        });
    }

    async deleteAlias(domain: string): Promise<unknown> {
        return this._json("DELETE", `/admin/api/aliases?domain=${encodeURIComponent(domain)}`);
    }

    /** Triggers `lego renew` for every registered alias. Idempotent. */
    async renewAliases(): Promise<unknown> {
        return this._json("POST", "/admin/api/aliases/renew");
    }

    // ── Files / folders / items ────────────────────────────────────────

    async createFolder(bucketId: string, input: { name: string; parentFolderID?: string | null }): Promise<StoredFolder> {
        return this._json("POST", `/admin/api/folders?bucketId=${encodeURIComponent(bucketId)}`, {
            name: input.name,
            ...(input.parentFolderID !== undefined ? { parentFolderID: input.parentFolderID } : {}),
        });
    }

    async listItems(bucketId: string, input: { folderID?: string; page?: number; limit?: number; accept?: string[] } = {}): Promise<unknown> {
        const params = new URLSearchParams({ bucketId });
        if (input.folderID) params.set("folderID", input.folderID);
        if (input.page)     params.set("page",     String(input.page));
        if (input.limit)    params.set("limit",    String(input.limit));
        if (input.accept)   params.set("accept",   input.accept.join(","));
        return this._json("GET", `/admin/api/items/list?${params.toString()}`);
    }

    async updateItem(bucketId: string, itemId: string, input: { name?: string; parentFolderID?: string | null; publicPath?: string | null }): Promise<unknown> {
        const body: Record<string, unknown> = {};
        if (input.name           !== undefined) body.name           = input.name;
        if (input.parentFolderID !== undefined) body.parentFolderID = input.parentFolderID;
        if (input.publicPath     !== undefined) body.publicPath     = input.publicPath;
        return this._json("PATCH", `/admin/api/items?bucketId=${encodeURIComponent(bucketId)}&id=${encodeURIComponent(itemId)}`, body);
    }

    async deleteItem(bucketId: string, itemId: string, input: { recursive?: boolean } = {}): Promise<unknown> {
        const params = new URLSearchParams({ bucketId, id: itemId });
        if (input.recursive) params.set("recursive", "true");
        return this._json("DELETE", `/admin/api/items?${params.toString()}`);
    }

    /** Uploads a binary file to a bucket. `body` accepts any `BodyInit` (Blob, File, stream, Buffer). */
    async uploadFile(bucketId: string, input: { name: string; mimeType: string; body: Blob | File | ReadableStream | ArrayBuffer | Uint8Array; parentFolderID?: string | null; publicPath?: string }): Promise<StoredFile> {
        const form = new FormData();
        form.set("file", new Blob([input.body as BlobPart], { type: input.mimeType }), input.name);
        form.set("name", input.name);
        if (input.parentFolderID !== undefined && input.parentFolderID !== null) form.set("parentFolderID", input.parentFolderID);
        if (input.publicPath     !== undefined) form.set("publicPath",     input.publicPath);
        return this._raw("POST", `/admin/api/files?bucketId=${encodeURIComponent(bucketId)}`, form);
    }

    /** Streams a file's bytes back. Returns the raw `Response` (caller calls `.blob()` / `.body` / `.arrayBuffer()`). */
    async getRawFile(fileId: string): Promise<Response> {
        const res = await this._fetch(`${this._baseUrl}/admin/api/files/raw?id=${encodeURIComponent(fileId)}`, {
            headers: { Authorization: `Bearer ${this._token}` },
        });
        if (!res.ok) throw new BucketsClientError("unknown", `HTTP ${res.status} on raw file fetch`, res.status);
        return res;
    }

    // ── private ────────────────────────────────────────────────────────

    private async _json<T>(method: string, path: string, body?: unknown): Promise<T> {
        const res = await this._fetch(`${this._baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${this._token}`,
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        return parseEnvelope<T>(res);
    }

    private async _raw<T>(method: string, path: string, body: BodyInit): Promise<T> {
        const res = await this._fetch(`${this._baseUrl}${path}`, {
            method,
            headers: { Authorization: `Bearer ${this._token}` },
            body,
        });
        return parseEnvelope<T>(res);
    }
}

// ── helpers ────────────────────────────────────────────────────────────

async function parseEnvelope<T>(res: Response): Promise<T> {
    let body: unknown;
    try { body = await res.json(); }
    catch { throw new BucketsClientError("unknown", `HTTP ${res.status}: non-JSON response`, res.status); }
    const env = body as { ok?: boolean; data?: T; error?: { code?: string; message?: string } };
    if (!env.ok) {
        const code    = (env.error?.code    ?? "unknown") as BucketsClientErrorCode;
        const message = env.error?.message  ?? `HTTP ${res.status}`;
        throw new BucketsClientError(code, message, res.status);
    }
    return env.data as T;
}

/** Server-side accepts FLAT bodies (matches `<w13c-form>` semantics). Flatten nested limits/quotas. */
function flattenBucket(input: BucketCreateInput | BucketUpdateInput): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if ("id"           in input && input.id           !== undefined) out.id           = input.id;
    if ("cacheControl" in input && input.cacheControl !== undefined) out.cacheControl = input.cacheControl;
    if ("notFoundPath" in input && input.notFoundPath !== undefined) out.notFoundPath = input.notFoundPath;
    if (input.quotas) {
        out.maxTotalSize = input.quotas.maxTotalSize;
        out.maxFileCount = input.quotas.maxFileCount;
    }
    if (input.limits) {
        out.maxFileSize       = input.limits.maxFileSize;
        out.acceptedMimeTypes = Array.isArray(input.limits.acceptedMimeTypes) ? input.limits.acceptedMimeTypes.join(",") : input.limits.acceptedMimeTypes;
    }
    if (input.allowedUploadOrigins) out.allowedUploadOrigins = input.allowedUploadOrigins.join(",");
    return out;
}

// ── public types ───────────────────────────────────────────────────────

export type BucketCreateInput = {
    id:                    string;
    cacheControl:          string;
    quotas:                BucketQuotas;
    limits:                BucketLimits;
    allowedUploadOrigins?: string[];
};

export type BucketUpdateInput = {
    cacheControl?:         string;
    quotas?:               BucketQuotas;
    limits?:               BucketLimits;
    allowedUploadOrigins?: string[];
    notFoundPath?:         string;
};

/** Wire-shape view of a `Bucket` — dates are ISO strings after JSON deserialization. */
export type BucketView = Omit<Bucket, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };

export type BucketCredentialView = {
    id:         string;
    bucketId:   string;
    label?:     string;
    createdAt:  string;
    expiresAt?: string;
    revokedAt?: string;
};

export type BucketsClientErrorCode = "not_found" | "unauthorized" | "forbidden" | "conflict" | "validation_error" | "unknown";

export class BucketsClientError extends Error {
    constructor(public readonly code: BucketsClientErrorCode, message: string, public readonly httpStatus: number) {
        super(message);
        this.name = "BucketsClientError";
    }
}
