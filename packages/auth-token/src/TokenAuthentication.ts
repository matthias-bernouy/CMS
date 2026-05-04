import type { Authentication, DefaultRole, Subject } from "@bernouy/core";

export type TokenConsumerConfig<Role extends string = DefaultRole> = {
    /**
     * Absolute URL of the Provider's introspect endpoint, e.g.
     * `"https://auth.aelf1er.fr/tokens/introspect"`. The Consumer posts
     * each bearer token to this URL to resolve a Subject.
     */
    introspectUrl: string;

    /**
     * Optional shared secret sent in the `X-Introspect-Secret` header.
     * MUST match the Provider's `introspectSecret` when set.
     */
    introspectSecret?: string;

    /**
     * URL pointing at the Provider's token management UI. Used as
     * `loginUrl` / `profileUrl` / `logoutUrl` so that UI code pointing a
     * user at "manage tokens" lands them on the central server. Absent →
     * all three URLs default to `"#"` (the provider is unreachable over
     * the browser).
     */
    providerManagementUrl?: string;

    /**
     * Positive-cache TTL in milliseconds. Valid introspect responses are
     * cached by raw token for this long to absorb burst traffic. Defaults
     * to 30 000 ms (30 s). Set to 0 to disable caching — every request
     * then triggers a Provider round-trip.
     */
    positiveCacheTtlMs?: number;

    /**
     * Negative-cache TTL in milliseconds. Invalid tokens are cached for a
     * much shorter period to protect against replay of a revoked token
     * slipping through. Defaults to 5 000 ms (5 s).
     */
    negativeCacheTtlMs?: number;

    /**
     * Maximum entries kept in the in-memory cache. When exceeded the
     * oldest entries are evicted (simple FIFO). Defaults to 10 000.
     */
    cacheMaxEntries?: number;

    /**
     * `AbortSignal`-like timeout for introspect calls, in milliseconds.
     * Applied per request. Defaults to 5 000 ms.
     */
    requestTimeoutMs?: number;
};

type CacheEntry<Role extends string> = {
    subject: Subject<Role> | null;
    expires: number;
};

type IntrospectResponse = {
    active?: boolean;
    identifier?: string;
    role?: string;
    displayName?: string;
};

/**
 * Remote counterpart of `TokenProvider`. Lightweight verifier intended to
 * live inside external apps that accept bearer tokens issued by a central
 * Provider but do not own the token storage.
 *
 * `getSubject` parses the `Authorization: Bearer ...` header and resolves
 * the Subject by calling the Provider's `POST /introspect` endpoint. A
 * short-TTL in-memory cache absorbs bursts of identical requests.
 *
 * Does NOT register any HTTP routes — it's a pure client.
 */
export class TokenAuthentication<Role extends string = DefaultRole> implements Authentication<Role> {

    readonly loginUrl: string;
    readonly logoutUrl: string;
    readonly profileUrl: string;

    private readonly _introspectUrl: string;
    private readonly _introspectSecret?: string;
    private readonly _positiveTtl: number;
    private readonly _negativeTtl: number;
    private readonly _maxEntries: number;
    private readonly _requestTimeout: number;
    private readonly _cache = new Map<string, CacheEntry<Role>>();

    constructor(config: TokenConsumerConfig<Role>) {
        this._introspectUrl = config.introspectUrl;
        this._introspectSecret = config.introspectSecret;
        this._positiveTtl = config.positiveCacheTtlMs ?? 30_000;
        this._negativeTtl = config.negativeCacheTtlMs ?? 5_000;
        this._maxEntries = config.cacheMaxEntries ?? 10_000;
        this._requestTimeout = config.requestTimeoutMs ?? 5_000;

        const mgmt = config.providerManagementUrl ?? "#";
        this.loginUrl = mgmt;
        this.logoutUrl = mgmt;
        this.profileUrl = mgmt;
    }

    buildLoginUrl(_returnTo: string): string {
        // Remote provider — we have no way to round-trip `returnTo` back
        // to a cross-origin destination. Best we can do is land the user
        // on the management page.
        return this.loginUrl;
    }

    buildLogoutUrl(_returnTo: string): string {
        return this.logoutUrl;
    }

    async getSubject(req: Request): Promise<Subject<Role> | null> {
        const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
        if (!header?.startsWith("Bearer ")) return null;
        const raw = header.slice(7).trim();
        if (!raw) return null;
        return this._introspect(raw);
    }

    /** Clears the cache. Call after a deployment if you think stale entries could cause issues. */
    clearCache(): void {
        this._cache.clear();
    }

    private async _introspect(raw: string): Promise<Subject<Role> | null> {
        const cached = this._cache.get(raw);
        if (cached && cached.expires > Date.now()) {
            return cached.subject;
        }

        let subject: Subject<Role> | null = null;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this._requestTimeout);
            try {
                const res = await fetch(this._introspectUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        ...(this._introspectSecret ? { "X-Introspect-Secret": this._introspectSecret } : {}),
                    },
                    body: JSON.stringify({ token: raw }),
                    signal: controller.signal,
                });
                if (res.ok) {
                    const body = (await res.json()) as IntrospectResponse;
                    if (body.active && typeof body.identifier === "string" && typeof body.role === "string") {
                        subject = {
                            identifier: body.identifier,
                            role: body.role as Role,
                            displayName: body.displayName,
                        };
                    }
                }
                // Any non-ok status (401, 5xx, network error) → treated as "unknown",
                // negatively cached short TTL so transient Provider errors don't
                // immediately lock everyone out; a real revocation still propagates.
            } finally {
                clearTimeout(timeout);
            }
        } catch {
            // Network / abort / JSON parse errors: treat as unknown.
            subject = null;
        }

        this._setCache(raw, subject);
        return subject;
    }

    private _setCache(raw: string, subject: Subject<Role> | null): void {
        if (this._positiveTtl === 0 && subject) return;
        if (this._negativeTtl === 0 && !subject) return;

        if (this._cache.size >= this._maxEntries) {
            // Simple FIFO eviction: drop the oldest insertion. Map
            // preserves insertion order so `keys().next()` gives us that.
            const oldest = this._cache.keys().next().value;
            if (oldest !== undefined) this._cache.delete(oldest);
        }

        const ttl = subject ? this._positiveTtl : this._negativeTtl;
        this._cache.set(raw, { subject, expires: Date.now() + ttl });
    }
}
