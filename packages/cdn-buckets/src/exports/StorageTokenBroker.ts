import type { Middleware, Runner } from "@bernouy/core";
import type {
    CDNCreateFolderOptions, CDNDeleteItemOptions, CDNGetItemsOptions,
    CDNItem, CDNItemsPage, CDNUpdateItemOptions, FileMetadata, FolderMetadata,
} from "@bernouy/core";
import type { Bucket } from "../interfaces/entities/Bucket";
import { buildHydrationScript } from "../core/broker/buildHydrationScript";
import { callProvider, proxyRequest, serializeListOpts } from "../core/broker/providerClient";

export type StorageTokenBrokerConfig = {
    runner: Runner;
    /** Origin of the StorageProvider (e.g. `https://cdn.bernouy.com`). */
    providerOrigin: string;
    /** Bucket-credential cleartext bearer token. Held only by this server. */
    credentialToken: string;
    /** Path prefix for frontier A. Default `"/_storage"`. */
    mountPath?: string;
    /** `globalThis` property name used by the hydration script to expose the
     *  rehydrated `StorageBrowser` instance. Default `"_storage"`. */
    varName?: string;
    /** Auth/CSRF middlewares from the host app applied to every frontier A endpoint. */
    middlewares?: Middleware[];
};

export type BrokerMintInput  = { name: string; maxSize: number; parentFolderID?: string | null; contentType?: string; publicPath?: string; ttlSec?: number };
export type BrokerMintResult = { id: string; uploadURL: string; expiresAt: string };

/**
 * Server companion to `StorageProvider`. Holds the bucket-credential bearer
 * token and exposes both a server-side API (callable directly) and an HTTP
 * relay (frontier A) that the browser hits without ever seeing the token.
 */
export class StorageTokenBroker {
    private _runner: Runner;
    private _providerOrigin: string;
    private _credentialToken: string;
    private _mountPath: string;
    private _varName: string;

    constructor(config: StorageTokenBrokerConfig) {
        this._runner          = config.runner;
        this._providerOrigin  = config.providerOrigin.replace(/\/+$/, "");
        this._credentialToken = config.credentialToken;
        this._mountPath       = config.mountPath ?? "/_storage";
        this._varName         = config.varName   ?? "_storage";

        const proxy = (req: Request, p: string) => proxyRequest(this._providerOrigin, this._credentialToken, req, p);
        this._runner.group(this._mountPath, (g) => {
            g.get   ("/bucket",        (req) => proxy(req, "/api/bucket"));
            g.get   ("/items/list",    (req) => proxy(req, "/api/items/list"));
            g.get   ("/items",         (req) => proxy(req, "/api/items"));
            g.post  ("/upload-tokens", (req) => proxy(req, "/api/upload-tokens"));
            g.post  ("/folders",       (req) => proxy(req, "/api/folders"));
            g.patch ("/items",         (req) => proxy(req, "/api/items"));
            g.delete("/items",         (req) => proxy(req, "/api/items"));
            g.get   ("/hydration.js",  ()    => this._serveHydration());
        }, config.middlewares ?? []);
    }

    /** Returns the hydration script body as a string. Use directly to inline
     *  in an SSR template (don't forget HTML-escaping if you do). */
    async getHydrationScript(): Promise<string> {
        const bucket = await this.getBucketInfo();
        return buildHydrationScript(this._varName, {
            apiBaseUrl: this._mountPath,
            bucket:     { limits: bucket.limits, quotas: bucket.quotas, cacheControl: bucket.cacheControl },
            // Upload presigned URLs resolve directly to the upstream provider
            // origin, so the consuming admin's CSP `connect-src` must whitelist
            // it. Same-origin setups list nothing (provider is just `'self'`).
            origins:    safeOriginList(this._providerOrigin),
        });
    }

    async getBucketInfo(): Promise<Bucket> { return this._call("GET", "/api/bucket"); }
    async getItem(id: string): Promise<CDNItem> { return this._call("GET", `/api/items?id=${encodeURIComponent(id)}`); }
    async deleteItem(opts: CDNDeleteItemOptions): Promise<{ id: string }> {
        const qs = `id=${encodeURIComponent(opts.id)}${opts.recursive ? "&recursive=true" : ""}`;
        return this._call("DELETE", `/api/items?${qs}`);
    }
    async createFolder(opts: CDNCreateFolderOptions): Promise<FolderMetadata> { return this._call("POST", "/api/folders", opts); }
    async updateItem(opts: CDNUpdateItemOptions): Promise<CDNItem> {
        const { id, ...body } = opts;
        return this._call("PATCH", `/api/items?id=${encodeURIComponent(id)}`, body);
    }
    async mintUploadToken(input: BrokerMintInput): Promise<BrokerMintResult> { return this._call("POST", "/api/upload-tokens", input); }
    async getItems(opts: CDNGetItemsOptions = {}): Promise<CDNItemsPage> { return this._call("GET", `/api/items/list?${serializeListOpts(opts)}`); }

    /** Server-side direct upload via mint + POST /upload. */
    async uploadFile(input: BrokerMintInput, body: BodyInit, contentType: string): Promise<FileMetadata> {
        const minted = await this.mintUploadToken(input);
        const res = await fetch(minted.uploadURL, { method: "POST", body, headers: { "Content-Type": contentType } });
        const json = await res.json() as { ok: true; data: FileMetadata } | { ok: false; error: { code: string; message: string } };
        if (!json.ok) throw new Error(`provider_upload_failed: ${json.error.code} — ${json.error.message}`);
        return json.data;
    }

    private async _serveHydration(): Promise<Response> {
        try {
            const script = await this.getHydrationScript();
            return new Response(script, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return new Response(`// hydration failed: ${message}`, { status: 500, headers: { "Content-Type": "application/javascript; charset=utf-8" } });
        }
    }

    private _call<T>(method: string, path: string, body?: unknown): Promise<T> {
        return callProvider<T>(this._providerOrigin, this._credentialToken, method, path, body);
    }

    get mountPath(): string { return this._mountPath; }
    get varName():   string { return this._varName;   }
}

function safeOriginList(url: string): string[] {
    try { return [new URL(url).origin]; }
    catch { return []; }
}
