import { jwtVerify, type JWTPayload } from "jose";
import type { SignedCookieCodec } from "cms-auth/sessions/core/SignedCookieCodec";
import type { SecretReader } from "@bernouy/secret-store";
import type { IdentityProviderRepository } from "cms-auth/providers/interfaces/IdentityProvider";
import type { SubjectResolver } from "cms-auth/accounts/core/SubjectResolver";
import { readCookie, setCookie, clearCookie, sanitizeReturnTo } from "cms-auth/sessions/core/cookies";
import { SessionCookie } from "cms-auth/sessions/core/SessionCookie";
import { privateAuthResponse } from "cms-auth/application/http/handlers/authResponse";
import { OidcMetadataCache } from "cms-auth/providers/default-implementation/oidc/OidcMetadataCache";
import { readIdentityClaims } from "cms-auth/providers/core/oidc/identityClaims";
import { buildAuthorizationUrl, createLoginFlight, type FlightPayload } from "cms-auth/providers/core/oidc/loginFlight";
import { resolveOidcProvider } from "cms-auth/providers/core/oidc/providerResolver";

export type OidcAuthConfig = {
    /** Absolute base for callback URLs: `<appBaseUrl><pathPrefix>/auth`. */
    callbackBase: string;
    providers: IdentityProviderRepository;
    secrets: SecretReader;
    resolver: SubjectResolver;
    codec: SignedCookieCodec;
    cookieName: string; // shared CMS session cookie
    loginPagePath: string; // where to send on failure
    defaultHome: string;
    cookieSecure?: boolean;
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
export class OidcAuthentication {
    private readonly metadata: OidcMetadataCache;
    private readonly sessions: SessionCookie;

    constructor(private readonly cfg: OidcAuthConfig) {
        this.metadata = new OidcMetadataCache(cfg.allowInsecureIssuer ?? false);
        this.sessions = new SessionCookie({
            codec: cfg.codec,
            cookieName: cfg.cookieName,
            cookieSecure: cfg.cookieSecure,
            ttlSeconds: cfg.sessionTtlSeconds,
        });
    }

    private _flightCookie(id: string) {
        return `${this.cfg.cookieName}-oidc-${id}`;
    }

    /** `GET <basePath>/:provider/login` handler — mounted by the surface. */
    async login(req: Request): Promise<Response> {
        const r = await resolveOidcProvider(req, this.cfg.providers, this.cfg.secrets, (issuer) =>
            this.metadata.acceptsIssuer(issuer),
        );
        if (!r) {
            return privateAuthResponse("Unknown provider", { status: 404 });
        }
        const { p } = r;
        const meta = await this.metadata.discover(p.issuer!);
        const returnTo = new URL(req.url).searchParams.get("returnTo") ?? "";

        const flight = await createLoginFlight(this.cfg.codec, returnTo);
        const url = buildAuthorizationUrl(meta, p, this.cfg.callbackBase, flight);

        return privateAuthResponse(null, {
            status: 302,
            headers: {
                Location: url.toString(),
                "Set-Cookie": setCookie(this._flightCookie(p.id), flight.token, 600, this.cfg.cookieSecure ?? false),
            },
        });
    }

    /** `GET <basePath>/:provider/callback` handler — mounted by the surface. */
    async callback(req: Request): Promise<Response> {
        const r = await resolveOidcProvider(req, this.cfg.providers, this.cfg.secrets, (issuer) =>
            this.metadata.acceptsIssuer(issuer),
        );
        if (!r) {
            return privateAuthResponse("Unknown provider", { status: 404 });
        }
        const { p, secret } = r;
        const q = new URL(req.url).searchParams;

        const raw = readCookie(req, this._flightCookie(p.id));
        const flight = raw ? await this.cfg.codec.verify<FlightPayload>(raw) : null;
        if (!flight || flight.kind !== "oidc-flight" || flight.state !== q.get("state")) {
            return this._fail(p.id, "bad_or_missing_flight");
        }

        const code = q.get("code");
        if (!code) {
            return this._fail(p.id, "no_code");
        }

        const meta = await this.metadata.discover(p.issuer!);
        const form = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: `${this.cfg.callbackBase}/${p.id}/callback`,
            client_id: p.clientId!,
            code_verifier: flight.codeVerifier,
        });
        if (secret) {
            form.set("client_secret", secret); // omit for public (PKCE-only) clients
        }
        const tokenRes = await fetch(meta.token_endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form,
        });
        if (!tokenRes.ok) {
            await tokenRes.body?.cancel().catch(() => undefined);
            return this._fail(p.id, `token_exchange_${tokenRes.status}`);
        }
        const tokens = (await tokenRes.json()) as { id_token?: string };
        if (!tokens.id_token) {
            return this._fail(p.id, "no_id_token");
        }

        let claims: JWTPayload;
        try {
            ({ payload: claims } = await jwtVerify(tokens.id_token, this.metadata.getJwks(meta.jwks_uri), {
                issuer: p.issuer,
                audience: p.clientId,
                algorithms: ["RS256", "ES256", "PS256"],
            }));
        } catch {
            return this._fail(p.id, "id_token_verify");
        }
        if (claims.nonce !== flight.nonce) {
            return this._fail(p.id, "nonce_mismatch");
        }

        const identity = readIdentityClaims(claims);
        if (!identity) {
            return this._fail(p.id, "no_sub");
        }
        const subject = await this.cfg.resolver.fromIdentity({ ...identity, provider: p.id });
        const secure = this.cfg.cookieSecure ?? false;
        const headers = new Headers({ Location: sanitizeReturnTo(flight.returnTo, this.cfg.defaultHome) });
        headers.append("Set-Cookie", await this.sessions.issue(subject.identifier));
        headers.append("Set-Cookie", clearCookie(this._flightCookie(p.id), secure));
        return privateAuthResponse(null, { status: 302, headers });
    }

    private _fail(providerId: string, reason: string): Response {
        console.warn(`[oidc:${providerId}] login failed: ${reason}`);
        return privateAuthResponse(null, {
            status: 302,
            headers: { Location: `${this.cfg.loginPagePath}?error=oidc` },
        });
    }
}
