import { randomBytes, createHash } from "node:crypto";
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";
import type { SignedCookieCodec } from "cms-auth/core/SignedCookieCodec";
import type { SecretReader } from "@bernouy/cms-secrets";
import type { IdentityProviderRepository, IdentityProvider } from "cms-auth/interfaces/IdentityProvider";
import type { SubjectResolver } from "cms-auth/core/SubjectResolver";
import { readCookie, setCookie, clearCookie, sanitizeReturnTo } from "cms-auth/core/cookies";
import { privateAuthResponse } from "cms-auth/http/authResponse";

type FlightPayload = { kind: "oidc-flight"; state: string; nonce: string; codeVerifier: string; returnTo: string };
type Meta = { authorization_endpoint: string; token_endpoint: string; jwks_uri: string };

export type OidcAuthConfig<Role extends string> = {
    /** Absolute base for callback URLs: `<appBaseUrl><pathPrefix>/auth`. */
    callbackBase:      string;
    providers:         IdentityProviderRepository;
    secrets:           SecretReader;
    resolver:          SubjectResolver<Role>;
    codec:             SignedCookieCodec;
    cookieName:        string;   // shared CMS session cookie
    loginPagePath:     string;   // where to send on failure
    defaultHome:       string;
    cookieSecure?:     boolean;
    sessionTtlSeconds?: number;
    /** Dev-only escape hatch to allow an `http://` issuer. Off by default: a
     *  non-https issuer makes discovery/token/JWKS MITM-forgeable, so it must
     *  never be enabled in production. */
    allowInsecureIssuer?: boolean;
};

/**
 * Dynamic OIDC login backend — ONE instance serves EVERY configured
 * redirect-style provider. Passive: exposes the `login`/`callback` handlers,
 * mounted at `<basePath>/:provider/login|callback` by the surface
 * (http/) — the surface or runtime decides where. The provider config +
 * client secret are resolved from the stores AT REQUEST TIME, so
 * adding/editing/enabling a provider in the admin takes effect with no
 * remount. Authorization Code + PKCE; on a verified id_token the identity
 * flows through `SubjectResolver` (keyed `provider:sub`) and the CMS issues
 * its shared session cookie.
 */
export class OidcAuthentication<Role extends string = string> {

    private readonly _ttl: number;
    private readonly _meta = new Map<string, Promise<Meta>>();
    private readonly _jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

    constructor(private readonly cfg: OidcAuthConfig<Role>) {
        this._ttl = cfg.sessionTtlSeconds ?? 3600;
    }

    private async _resolve(req: Request): Promise<{ p: IdentityProvider; secret: string } | null> {
        // Provider id = the segment before /login|/callback (basePath-agnostic).
        const m = new URL(req.url).pathname.match(/\/([^/]+)\/(?:login|callback)$/);
        const id = m?.[1];
        if (!id) return null;
        const p = await this.cfg.providers.get(id);
        if (!p || !p.enabled || p.kind !== "oidc" || !p.issuer || !p.clientId) return null;
        // The issuer MUST be https — discovery, token exchange and JWKS all hit
        // it, so an http issuer is MITM-forgeable (→ forged id_token). Refuse it
        // by default, independent of cookieSecure; only an explicit dev opt-in
        // (`allowInsecureIssuer`) lets a local http issuer through. Logged so the
        // rejection isn't a silent "unknown provider" 404 in dev.
        if (!this._isHttps(p.issuer) && !this.cfg.allowInsecureIssuer) {
            console.warn(`OIDC: provider "${id}" rejected — issuer "${p.issuer}" is not https (set allowInsecureIssuer to permit http in dev).`);
            return null;
        }
        const key = p.clientSecretRef ? p.clientSecretRef.replace(/^\$\{(.+)\}$/, "$1") : null;
        const secret = key ? (await this.cfg.secrets.get(key)) ?? "" : "";
        return { p, secret };
    }

    private _discover(issuer: string): Promise<Meta> {
        const base = issuer.replace(/\/+$/, "");
        let m = this._meta.get(base);
        if (!m) {
            m = this._fetchMeta(base);
            this._meta.set(base, m);
            m.catch(() => this._meta.delete(base));   // never cache a failed lookup
        }
        return m;
    }

    private _isHttps(u: string): boolean {
        try { return new URL(u).protocol === "https:"; } catch { return false; }
    }

    private async _fetchMeta(base: string): Promise<Meta> {
        const res = await fetch(`${base}/.well-known/openid-configuration`);
        if (!res.ok) throw new Error(`discovery failed: ${res.status}`);
        // A 30x could downgrade discovery to http; the final URL must stay https.
        if (!this.cfg.allowInsecureIssuer && res.url && !this._isHttps(res.url)) {
            throw new Error("discovery: redirected to a non-https URL");
        }
        const meta = await res.json() as Partial<Meta>;
        if (!meta.authorization_endpoint || !meta.token_endpoint || !meta.jwks_uri) {
            throw new Error("discovery: missing required endpoints");
        }
        // The discovery document controls the URLs we hit next (authorization,
        // token exchange, JWKS). A compromised/MITM issuer could point these at
        // http to downgrade them — require https on each unless dev opt-in.
        if (!this.cfg.allowInsecureIssuer) {
            for (const ep of [meta.authorization_endpoint, meta.token_endpoint, meta.jwks_uri]) {
                if (!this._isHttps(ep)) throw new Error(`discovery: non-https endpoint rejected (${ep})`);
            }
        }
        return meta as Meta;
    }

    private _getJwks(uri: string) {
        let j = this._jwks.get(uri);
        if (!j) { j = createRemoteJWKSet(new URL(uri)); this._jwks.set(uri, j); }
        return j;
    }

    private _flightCookie(id: string) { return `${this.cfg.cookieName}-oidc-${id}`; }

    /** `GET <basePath>/:provider/login` handler — mounted by the surface. */
    async login(req: Request): Promise<Response> {
        const r = await this._resolve(req);
        if (!r) return privateAuthResponse("Unknown provider", { status: 404 });
        const { p } = r;
        const meta = await this._discover(p.issuer!);
        const returnTo = new URL(req.url).searchParams.get("returnTo") ?? "";

        const codeVerifier = randomBytes(32).toString("base64url");
        const challenge    = createHash("sha256").update(codeVerifier).digest("base64url");
        const state = randomBytes(16).toString("base64url");
        const nonce = randomBytes(16).toString("base64url");
        const flight = await this.cfg.codec.sign({ kind: "oidc-flight", state, nonce, codeVerifier, returnTo }, 600);

        const url = new URL(meta.authorization_endpoint);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", p.clientId!);
        url.searchParams.set("redirect_uri", `${this.cfg.callbackBase}/${p.id}/callback`);
        url.searchParams.set("scope", (p.scopes ?? ["openid", "email", "profile"]).join(" "));
        url.searchParams.set("state", state);
        url.searchParams.set("nonce", nonce);
        url.searchParams.set("code_challenge", challenge);
        url.searchParams.set("code_challenge_method", "S256");

        return privateAuthResponse(null, {
            status: 302,
            headers: { Location: url.toString(), "Set-Cookie": setCookie(this._flightCookie(p.id), flight, 600, this.cfg.cookieSecure ?? false) },
        });
    }

    /** `GET <basePath>/:provider/callback` handler — mounted by the surface. */
    async callback(req: Request): Promise<Response> {
        const r = await this._resolve(req);
        if (!r) return privateAuthResponse("Unknown provider", { status: 404 });
        const { p, secret } = r;
        const q = new URL(req.url).searchParams;

        const raw = readCookie(req, this._flightCookie(p.id));
        const flight = raw ? await this.cfg.codec.verify<FlightPayload>(raw) : null;
        if (!flight || flight.kind !== "oidc-flight" || flight.state !== q.get("state")) return this._fail(p.id, "bad_or_missing_flight");

        const code = q.get("code");
        if (!code) return this._fail(p.id, "no_code");

        const meta = await this._discover(p.issuer!);
        const form = new URLSearchParams({
            grant_type: "authorization_code", code, redirect_uri: `${this.cfg.callbackBase}/${p.id}/callback`,
            client_id: p.clientId!, code_verifier: flight.codeVerifier,
        });
        if (secret) form.set("client_secret", secret);   // omit for public (PKCE-only) clients
        const tokenRes = await fetch(meta.token_endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form,
        });
        if (!tokenRes.ok) {
            const body = await tokenRes.text().catch(() => "");
            return this._fail(p.id, `token_exchange ${tokenRes.status}: ${body.slice(0, 200)}`);
        }
        const tokens = await tokenRes.json() as { id_token?: string };
        if (!tokens.id_token) return this._fail(p.id, "no_id_token");

        let claims: JWTPayload;
        try {
            ({ payload: claims } = await jwtVerify(tokens.id_token, this._getJwks(meta.jwks_uri), {
                issuer: p.issuer, audience: p.clientId, algorithms: ["RS256", "ES256", "PS256"],
            }));
        } catch (e) {
            return this._fail(p.id, `id_token_verify: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (claims.nonce !== flight.nonce) return this._fail(p.id, "nonce_mismatch");

        const sub = String(claims.sub ?? "");
        if (!sub) return this._fail(p.id, "no_sub");
        // Only trust `email` when the provider asserts it is verified. A provider
        // that lets users self-set an unverified address would otherwise seed a
        // forged email/displayName into the CMS user list (impersonation in the
        // admin surfaces). `email_verified` is a boolean per OIDC spec; tolerate
        // the common "true" string variant too.
        const emailVerified = claims.email_verified === true || claims.email_verified === "true";
        const email = emailVerified && typeof claims.email === "string" ? claims.email : undefined;
        const displayName = String(claims.name ?? claims.preferred_username ?? email ?? sub);

        const subject = await this.cfg.resolver.fromIdentity({ sub, email, displayName, provider: p.id });
        const session = await this.cfg.codec.sign({ kind: "session", sub: subject.identifier }, this._ttl);
        const secure = this.cfg.cookieSecure ?? false;
        const headers = new Headers({ Location: sanitizeReturnTo(flight.returnTo, this.cfg.defaultHome) });
        headers.append("Set-Cookie", setCookie(this.cfg.cookieName, session, this._ttl, secure));
        headers.append("Set-Cookie", clearCookie(this._flightCookie(p.id), secure));
        return privateAuthResponse(null, { status: 302, headers });
    }

    private _fail(providerId: string, reason: string): Response {
        console.warn(`[oidc:${providerId}] login failed: ${reason}`);
        return privateAuthResponse(null, { status: 302, headers: { Location: `${this.cfg.loginPagePath}?error=oidc` } });
    }
}
