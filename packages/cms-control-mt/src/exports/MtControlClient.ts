import type { TenantKeycloak, TenantCdnBucket, TenantDelivery } from "src/interfaces/Tenant";

/**
 * Typed HTTP client for `/superadmin/api/*` on a `cms-control-mt` instance.
 *
 * Auth = bearer JWT issued by the platform's Keycloak for a service-account
 * client (typically `hub-orchestrator` in `master`, granted the `cms-superadmin`
 * realm role). The bearer is forwarded as `Authorization: Bearer <jwt>` and
 * validated server-side by the `KeycloakBearerConsumer` composed in the
 * cms-control-mt superadmin auth chain.
 *
 * All response shapes type `Date` as `string` (ISO) — JSON wire format
 * doesn't preserve `Date` instances.
 */
export class MtControlClient {

    private readonly _baseUrl: string;
    private readonly _token:   string;
    private readonly _fetch:   typeof fetch;

    constructor(config: { baseUrl: string; token: string; fetch?: typeof fetch }) {
        this._baseUrl = config.baseUrl.replace(/\/+$/, "");
        this._token   = config.token;
        this._fetch   = config.fetch ?? globalThis.fetch.bind(globalThis);
    }

    // ── Tenants ────────────────────────────────────────────────────────

    async listTenants(): Promise<TenantView[]> {
        return this._json("GET", "/superadmin/api/tenants");
    }

    /** Creates a tenant + immediately mounts it on the runner. The Keycloak/CDN/optional Delivery
     *  blocks must be provided up-front (rotations require a recreate, not a patch). */
    async createTenant(input: TenantCreateInput): Promise<{ id: string; name: string }> {
        return this._json("POST", "/superadmin/api/tenants", flattenTenant(input));
    }

    /** Patches the `delivery` block of an existing tenant. Other fields are not patchable —
     *  rotate via delete + create to keep the runtime mount clean. */
    async updateTenantDelivery(id: string, input: TenantDeliveryUpdateInput): Promise<{ id: string; deliveryEnabled: boolean }> {
        const body: Record<string, unknown> = {};
        if (input.publicCdn) {
            body["delivery.publicCdn.url"]              = input.publicCdn.url;
            body["delivery.publicCdn.bucketCredential"] = input.publicCdn.bucketCredential;
        }
        if (input.alias   !== undefined) body["delivery.alias"]   = input.alias;
        if (input.enabled !== undefined) body["delivery.enabled"] = input.enabled ? "true" : "false";
        return this._json("PATCH", `/superadmin/api/tenants?id=${encodeURIComponent(id)}`, body);
    }

    async deleteTenant(id: string): Promise<{ id: string }> {
        return this._json("DELETE", `/superadmin/api/tenants?id=${encodeURIComponent(id)}`);
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
        let env: { ok?: boolean; data?: T; error?: { code?: string; message?: string } };
        try { env = await res.json() as typeof env; }
        catch { throw new MtControlClientError("unknown", `HTTP ${res.status}: non-JSON response`, res.status); }
        if (!env.ok) {
            const code    = (env.error?.code    ?? "unknown") as MtControlClientErrorCode;
            const message = env.error?.message  ?? `HTTP ${res.status}`;
            throw new MtControlClientError(code, message, res.status);
        }
        return env.data as T;
    }
}

// ── helpers ────────────────────────────────────────────────────────────

/** Server-side parser expects FLAT bodies with dotted keys (matches `<w13c-form>`). */
function flattenTenant(input: TenantCreateInput): Record<string, unknown> {
    const out: Record<string, unknown> = { id: input.id, name: input.name };
    out["keycloak.issuer"]        = input.keycloak.issuer;
    out["keycloak.clientId"]      = input.keycloak.clientId;
    out["keycloak.clientSecret"]  = input.keycloak.clientSecret;
    out["keycloak.sessionSecret"] = input.keycloak.sessionSecret;
    out["keycloak.adminRole"]     = input.keycloak.adminRole;
    if (input.keycloak.cliClientId) out["keycloak.cliClientId"] = input.keycloak.cliClientId;
    out["assetsCdn.url"]              = input.assetsCdn.url;
    out["assetsCdn.bucketCredential"] = input.assetsCdn.bucketCredential;
    if (input.delivery) {
        out["delivery.publicCdn.url"]              = input.delivery.publicCdn.url;
        out["delivery.publicCdn.bucketCredential"] = input.delivery.publicCdn.bucketCredential;
        if (input.delivery.alias)   out["delivery.alias"]   = input.delivery.alias;
        if (input.delivery.enabled) out["delivery.enabled"] = "true";
    }
    return out;
}

// ── public types ───────────────────────────────────────────────────────

export type TenantCreateInput = {
    id:        string;
    name:      string;
    keycloak:  TenantKeycloak;
    assetsCdn: TenantCdnBucket;
    delivery?: Pick<TenantDelivery, "publicCdn" | "alias" | "enabled">;
};

export type TenantDeliveryUpdateInput = {
    publicCdn?: TenantCdnBucket;
    alias?:     string;
    enabled?:   boolean;
};

/** Wire-shape view of a Tenant as returned by `listTenants` — secrets stripped, dates as ISO strings. */
export type TenantView = {
    id:        string;
    name:      string;
    createdAt: string;
    updatedAt: string;
    keycloak:  { issuer: string; clientId: string; adminRole: string };
    assetsCdn: { url: string };
    delivery:  { publicCdn: { url: string }; alias?: string; enabled: boolean; hasCredential: boolean } | null;
};

export type MtControlClientErrorCode = "not_found" | "unauthenticated" | "unauthorized" | "forbidden" | "conflict" | "validation_error" | "unknown";

export class MtControlClientError extends Error {
    constructor(public readonly code: MtControlClientErrorCode, message: string, public readonly httpStatus: number) {
        super(message);
        this.name = "MtControlClientError";
    }
}
