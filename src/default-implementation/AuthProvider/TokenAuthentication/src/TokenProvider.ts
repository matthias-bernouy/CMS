import type { Authentication, DefaultRole, Subject } from "../../../../interfaces/Authentication";
import type { ApiToken, ApiTokenRepository } from "./interfaces/ApiTokenRepository";
import type { Runner } from "../../../../interfaces/Runner";
import { htmlResponse, redirect } from "../../../../utilities/html";
import { randomBase64Url, sha256Hex } from "../../../../utilities/crypto";
import {
    renderTokensPage,
    renderTokenCreatedPage,
    renderDisabledPage,
    renderErrorPage,
} from "./pages";

export type TokenProviderConfig<Role extends string = DefaultRole> = {
    /**
     * Identity provider used to gate the management pages (list, create,
     * revoke). These pages require a browser session — typically the same
     * Keycloak consumer the rest of the app uses. The `inner.getSubject`
     * MUST resolve to the actual human account creating tokens; its
     * `identifier` and `role` are snapshotted onto each new token.
     */
    inner: Authentication<Role>;

    /** Storage implementation. See `ApiTokenRepository`. */
    repository: ApiTokenRepository<Role>;

    /** Path prefix under which management routes are mounted. Defaults to `/tokens`. */
    basePath?: string;

    /**
     * Leak-detectable prefix prepended to every raw token (e.g. `be5_`).
     * Secret scanners can hook onto this prefix to flag accidentally
     * committed tokens. MUST end with a non-alphanumeric separator.
     */
    tokenPrefix?: string;

    /** Hard cap on active (non-revoked, non-expired) tokens per owner. Defaults to 20. */
    maxTokensPerUser?: number;

    /**
     * Resolves the current Subject from an owner sub at verification time.
     * When provided, local verification and the introspect endpoint both
     * return the fresh Subject instead of the snapshot stored on the token.
     * Use when role changes in the IdP must propagate immediately to
     * existing tokens.
     */
    refresher?: (ownerSub: string) => Promise<Subject<Role> | null>;

    /**
     * Secret(s) accepted in the `X-Introspect-Secret` header on calls to
     * `POST ${basePath}/introspect`. When omitted the endpoint is reachable
     * by any caller — fine in a trusted internal network, risky on the
     * public internet. Recommended in prod.
     *
     * Pass an **array** to let each Consumer use its own secret: a leak on
     * one instance only forces you to drop that one entry instead of
     * rotating the whole fleet. The check is a simple set-membership test
     * using constant-time comparison.
     */
    introspectSecret?: string | string[];
};

/**
 * Central token authority. Owns the storage, the management UI and the
 * introspect endpoint. Deploy this on the shared auth server; external
 * apps wanting to authenticate requests by bearer token should use
 * `TokenConsumer`, which delegates verification back to `/introspect`.
 *
 * Implements `Authentication<Role>` so the same process can both ISSUE
 * tokens (via the UI) and CONSUME them locally (via `getSubject`) without
 * paying the HTTP round-trip.
 *
 * Registers under `basePath`:
 *   - `GET /`                — token list + creation form (requires `inner` session)
 *   - `POST /`               — create a new token, renders one-shot display
 *   - `POST /:id/revoke`     — soft-revoke a token
 *   - `GET /login-disabled`  — explanatory page served when the user lands
 *                              on `loginUrl` or `logoutUrl` (bearer providers
 *                              have no browser login/logout flow).
 *   - `POST /introspect`     — JSON endpoint used by remote `TokenConsumer`
 *                              instances. Accepts `application/x-www-form-urlencoded`
 *                              or `application/json` with a `token` field.
 *                              Optional `X-Introspect-Secret` header gate.
 */
export class TokenProvider<Role extends string = DefaultRole> implements Authentication<Role> {

    readonly loginUrl: string;
    readonly logoutUrl: string;
    readonly profileUrl: string;

    private readonly _inner: Authentication<Role>;
    private readonly _repository: ApiTokenRepository<Role>;
    private readonly _basePath: string;
    private readonly _tokenPrefix: string;
    private readonly _maxTokensPerUser: number;
    private readonly _refresher?: (ownerSub: string) => Promise<Subject<Role> | null>;
    private readonly _introspectSecrets: readonly string[];

    constructor(runner: Runner, config: TokenProviderConfig<Role>) {
        this._inner = config.inner;
        this._repository = config.repository;
        this._basePath = stripTrailingSlash(config.basePath ?? "/tokens");
        this._tokenPrefix = config.tokenPrefix ?? "be5_";
        this._maxTokensPerUser = config.maxTokensPerUser ?? 20;
        this._refresher = config.refresher;
        this._introspectSecrets =
            config.introspectSecret === undefined ? []
            : typeof config.introspectSecret === "string" ? [config.introspectSecret]
            : [...config.introspectSecret];

        this.loginUrl = `${this._basePath}/login-disabled`;
        this.logoutUrl = `${this._basePath}/login-disabled`;
        this.profileUrl = this._basePath || "/";

        runner.group(this._basePath, (r) => {
            r.get("/", (req) => this._listPage(req));
            r.post("/", (req) => this._createToken(req));
            r.post("/:id/revoke", (req) => this._revokeToken(req));
            r.get("/login-disabled", () => this._disabledPage());
            r.post("/introspect", (req) => this._introspect(req));
        });
    }

    // ── Authentication<Role> ─────────────────────────────────────────────

    buildLoginUrl(returnTo: string): string {
        return `${this.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        return `${this.logoutUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    async getSubject(req: Request): Promise<Subject<Role> | null> {
        const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
        if (!header) return null;
        if (!header.startsWith("Bearer ")) return null;
        const raw = header.slice(7).trim();
        if (!raw) return null;
        return this._verifyRawToken(raw);
    }

    // ── bearer verification ──────────────────────────────────────────────

    private async _verifyRawToken(raw: string): Promise<Subject<Role> | null> {
        if (!raw.startsWith(this._tokenPrefix)) return null;
        const hash = await sha256Hex(raw);
        const token = await this._repository.findByHash(hash);
        if (!token) return null;
        if (token.revokedAt) return null;
        if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) return null;

        // best-effort: don't block request on the write, swallow errors
        void this._repository.touchLastUsed(token.id).catch(() => { /* noop */ });

        if (this._refresher) {
            return this._refresher(token.ownerSub);
        }
        return {
            identifier: token.ownerSub,
            role: token.ownerRole,
            displayName: token.ownerDisplayName,
        };
    }

    // ── management routes ────────────────────────────────────────────────

    private async _listPage(req: Request): Promise<Response> {
        const subject = await this._inner.getSubject(req);
        if (!subject) return redirect(this._inner.buildLoginUrl(this._basePath));

        const tokens = await this._repository.findByOwner(subject.identifier);
        const activeCount = tokens.filter((t) => !isInactive(t)).length;

        return htmlResponse(renderTokensPage({
            subject,
            tokens,
            activeCount,
            maxTokens: this._maxTokensPerUser,
            basePath: this._basePath,
            innerLogoutUrl: this._inner.logoutUrl,
        }));
    }

    private async _createToken(req: Request): Promise<Response> {
        const subject = await this._inner.getSubject(req);
        if (!subject) return redirect(this._inner.buildLoginUrl(this._basePath));

        const active = await this._repository.countActiveByOwner(subject.identifier);
        if (active >= this._maxTokensPerUser) {
            return htmlResponse(renderErrorPage({
                basePath: this._basePath,
                message: `Tu as atteint la limite de ${this._maxTokensPerUser} tokens actifs. Révoque-en un avant d'en créer un nouveau.`,
            }), 429);
        }

        const form = await req.formData();
        const label = (form.get("label")?.toString() ?? "").trim();
        const ttlRaw = form.get("ttlDays")?.toString().trim();

        if (!label) {
            return htmlResponse(renderErrorPage({
                basePath: this._basePath,
                message: "Un label est requis.",
            }), 400);
        }
        if (label.length > 120) {
            return htmlResponse(renderErrorPage({
                basePath: this._basePath,
                message: "Le label ne peut pas dépasser 120 caractères.",
            }), 400);
        }

        let expiresAt: Date | undefined;
        if (ttlRaw) {
            const days = parseInt(ttlRaw, 10);
            if (Number.isNaN(days) || days <= 0 || days > 3650) {
                return htmlResponse(renderErrorPage({
                    basePath: this._basePath,
                    message: "La durée doit être un entier positif (max 3650 jours).",
                }), 400);
            }
            expiresAt = new Date(Date.now() + days * 86_400_000);
        }

        const raw = `${this._tokenPrefix}${randomBase64Url(48)}`;
        const hash = await sha256Hex(raw);

        await this._repository.create({
            ownerSub: subject.identifier,
            ownerRole: subject.role,
            ownerDisplayName: subject.displayName,
            tokenHash: hash,
            label,
            ...(expiresAt !== undefined ? { expiresAt } : {}),
        });

        return htmlResponse(renderTokenCreatedPage({ raw, label, basePath: this._basePath }));
    }

    private async _revokeToken(req: Request): Promise<Response> {
        const subject = await this._inner.getSubject(req);
        if (!subject) return redirect(this._inner.buildLoginUrl(this._basePath));

        const id = extractIdFromRevokePath(new URL(req.url).pathname);
        if (!id) {
            return htmlResponse(renderErrorPage({
                basePath: this._basePath,
                message: "Requête invalide.",
            }), 400);
        }

        await this._repository.revoke(id, subject.identifier);
        return redirect(this._basePath);
    }

    private _disabledPage(): Response {
        return htmlResponse(renderDisabledPage({
            innerLoginUrl: this._inner.loginUrl,
            basePath: this._basePath,
        }));
    }

    /**
     * Remote token introspection. Shape loosely modelled on RFC 7662:
     * always returns 200 with `{ active: boolean, ...subject? }` so callers
     * have a single JSON shape to parse.
     *
     * Status codes:
     *   - 200 `{ active: true, identifier, role, displayName? }`  — valid
     *   - 200 `{ active: false }`                                  — unknown, revoked, expired
     *   - 401                                                      — bad or missing `X-Introspect-Secret`
     *   - 400                                                      — missing `token` field
     */
    private async _introspect(req: Request): Promise<Response> {
        if (this._introspectSecrets.length > 0) {
            const provided = req.headers.get("x-introspect-secret") ?? req.headers.get("X-Introspect-Secret");
            if (!provided || !secretsContain(this._introspectSecrets, provided)) {
                return new Response(null, { status: 401 });
            }
        }

        const raw = await readTokenFromRequest(req);
        if (!raw) {
            return Response.json({ error: "missing_token" }, { status: 400 });
        }

        const subject = await this._verifyRawToken(raw);
        if (!subject) {
            return Response.json({ active: false });
        }
        return Response.json({
            active: true,
            identifier: subject.identifier,
            role: subject.role,
            ...(subject.displayName !== undefined ? { displayName: subject.displayName } : {}),
        });
    }
}

// ── helpers ──────────────────────────────────────────────────────────────

function stripTrailingSlash(s: string): string {
    return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
}

/**
 * Accepts the token in three places so callers can pick whatever fits
 * their HTTP client best:
 *   - form-urlencoded body `token=...` (RFC 7662 shape)
 *   - JSON body `{"token": "..."}` (ergonomic for fetch)
 *   - `Authorization: Bearer ...` header (convenient when proxying)
 */
async function readTokenFromRequest(req: Request): Promise<string | null> {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
        const raw = authHeader.slice(7).trim();
        if (raw) return raw;
    }

    const contentType = req.headers.get("content-type") ?? "";
    try {
        if (contentType.includes("application/json")) {
            const body = await req.json() as { token?: unknown };
            return typeof body.token === "string" && body.token.length > 0 ? body.token : null;
        }
        if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
            const form = await req.formData();
            const token = form.get("token")?.toString().trim();
            return token && token.length > 0 ? token : null;
        }
    } catch {
        return null;
    }
    return null;
}

function isInactive(t: ApiToken<string>): boolean {
    if (t.revokedAt) return true;
    if (t.expiresAt && t.expiresAt.getTime() <= Date.now()) return true;
    return false;
}

/**
 * Set-membership with constant-time comparison *per candidate*, so the
 * provider can't be used as an oracle to recover a secret byte-by-byte
 * via response-timing analysis. We still return early on length mismatch
 * (reveals a length hint only — acceptable trade-off vs. hashing every
 * secret).
 */
function secretsContain(accepted: readonly string[], provided: string): boolean {
    let match = false;
    for (const s of accepted) {
        if (constantTimeEquals(s, provided)) match = true;
    }
    return match;
}

function constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

/**
 * Parses `/whatever/tokens/:id/revoke` and returns the `:id` segment.
 * The runner matches the pattern but does not expose captured params, so
 * we recover it from the URL. Returns null if the shape doesn't match.
 */
function extractIdFromRevokePath(pathname: string): string | null {
    const parts = pathname.split("/").filter(Boolean);
    if (parts[parts.length - 1] !== "revoke") return null;
    const id = parts[parts.length - 2];
    return id && id.length > 0 ? id : null;
}

