import { createRemoteJWKSet } from "jose";

import type { Authentication, DefaultRole, Subject } from "../../../interfaces/Authentication";
import type { Runner } from "../../../interfaces/Runner";

import type { KeycloakConsumerConfig } from "./src/config";
import { defaultClaimsToSubject } from "./src/claims";
import { Discovery } from "./src/discovery";
import { CookieFactory } from "./src/cookies";
import { SessionCodec } from "./src/session";
import { stripTrailingSlash, detectCookieSecure } from "./src/url";
import { KeycloakHandlers } from "./src/handlers";

export type { KeycloakConsumerConfig } from "./src/config";

/**
 * `Authentication` provider backed by Keycloak (or any OIDC-conformant IdP).
 * Authorization Code + PKCE; verifies id_token + access_token against the
 * IdP's JWKS; stores a stateless HMAC-signed session cookie.
 *
 * Registers four routes on `runner` under `basePath`:
 *   `GET /login` · `GET /callback` · `GET /logout` · `GET /post-logout-callback`
 */
export class KeycloakConsumer<Role extends string = DefaultRole> implements Authentication<Role> {

    readonly loginUrl: string;
    readonly logoutUrl: string;
    readonly profileUrl: string;
    readonly callbackUrl: string;
    readonly postLogoutCallbackUrl: string;

    private readonly _handlers: KeycloakHandlers<Role>;

    constructor(runner: Runner, config: KeycloakConsumerConfig<Role>) {
        if (!config.sessionSecret || config.sessionSecret.length < 16) {
            throw new Error("KeycloakConsumer: sessionSecret must be a strong secret (>= 16 chars).");
        }

        const issuer = stripTrailingSlash(config.issuer);
        const appBaseUrl = stripTrailingSlash(config.appBaseUrl);
        const basePath = config.basePath ?? "/auth";

        this.loginUrl = `${appBaseUrl}${basePath}/login`;
        this.logoutUrl = `${appBaseUrl}${basePath}/logout`;
        this.profileUrl = `${issuer}/account`;
        this.callbackUrl = `${appBaseUrl}${basePath}/callback`;
        this.postLogoutCallbackUrl = `${appBaseUrl}${basePath}/post-logout-callback`;

        this._handlers = new KeycloakHandlers<Role>({
            issuer,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            callbackUrl: this.callbackUrl,
            postLogoutCallbackUrl: this.postLogoutCallbackUrl,
            basePath,
            defaultReturnTo: config.defaultReturnTo ?? "/",
            scopes: config.scopes ?? ["openid", "profile", "email"],
            // Conditional type on `claimsToSubject` forces the override when Role ≠ DefaultRole;
            // the default mapper only fills the Role = DefaultRole branch.
            claimsToSubject: (config.claimsToSubject ?? defaultClaimsToSubject) as (claims: Record<string, unknown>) => Subject<Role> | null,
            discovery: new Discovery(issuer),
            cookies: new CookieFactory(
                config.cookieName ?? "be5-session",
                config.cookieSecure ?? detectCookieSecure(appBaseUrl),
            ),
            codec: new SessionCodec(
                new TextEncoder().encode(config.sessionSecret),
                config.sessionTtlSeconds ?? 3600,
            ),
            jwks: createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`)),
        });

        runner.group(basePath, (r) => {
            r.get("/login", (req) => this._handlers.startLogin(req));
            r.get("/callback", (req) => this._handlers.completeLogin(req));
            r.get("/logout", (req) => this._handlers.startLogout(req));
            r.get("/post-logout-callback", (req) => this._handlers.completeLogout(req));
        });
    }

    buildLoginUrl(returnTo: string): string {
        return `${this.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        return `${this.logoutUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    async getSubject(req: Request): Promise<Subject<Role> | null> {
        const session = await this._handlers.readSession(req);
        if (!session) return null;
        return { identifier: session.sub, role: session.role, displayName: session.displayName };
    }
}
