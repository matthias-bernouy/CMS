import type { Authentication, DefaultRole, Subject } from "@bernouy/core";
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";

export type KeycloakBearerConsumerConfig<Role extends string = DefaultRole> = {
    /** OIDC issuer of the realm. Same value as `KeycloakConsumerConfig.issuer`
     *  — the bearer token MUST have been issued by this realm. */
    issuer: string;
    /**
     * Maps the verified JWT payload to a `Subject<Role>`. Same shape as
     * `KeycloakConsumerConfig.claimsToSubject` — share the function with the
     * cookie consumer so cookie and bearer auth produce identical subjects.
     */
    claimsToSubject: (claims: Record<string, unknown>) => Subject<Role> | null;
    /**
     * Optional `aud` claim restriction. Useful when a single realm hosts
     * several clients (web + CLI) and the CMS server should accept only
     * tokens addressed to it. Omit to accept any audience from the realm.
     */
    audience?: string | string[];
};

/**
 * Stateless `Authentication<Role>` that validates `Authorization: Bearer <jwt>`
 * locally via the realm's JWKS. Designed to compose with `KeycloakConsumer`
 * (cookie/session-based) through `auth-composite` so a single CMS server
 * accepts both browser sessions and CLI/API tokens minted via Keycloak's
 * Device Authorization Grant flow (or any other grant emitting a JWT).
 *
 * The bearer flow is consume-only: there are no callback routes and no
 * login URL — clients must obtain the token outside of this consumer. The
 * `loginUrl` / `logoutUrl` / `profileUrl` fields are intentionally empty;
 * compose with a cookie consumer when a browser-loginable surface is
 * needed (the composite delegates URL fields to the chosen `profileChild`).
 */
export class KeycloakBearerConsumer<Role extends string = DefaultRole> implements Authentication<Role> {

    readonly loginUrl   = "";
    readonly logoutUrl  = "";
    readonly profileUrl = "";

    private _issuer:          string;
    private _jwks:            ReturnType<typeof createRemoteJWKSet>;
    private _claimsToSubject: (claims: Record<string, unknown>) => Subject<Role> | null;
    private _audience?:       string | string[];

    constructor(config: KeycloakBearerConsumerConfig<Role>) {
        this._issuer          = config.issuer.replace(/\/+$/, "");
        this._jwks            = createRemoteJWKSet(new URL(`${this._issuer}/protocol/openid-connect/certs`));
        this._claimsToSubject = config.claimsToSubject;
        if (config.audience !== undefined) this._audience = config.audience;
    }

    buildLoginUrl(): string  { return ""; }
    buildLogoutUrl(): string { return ""; }

    async getSubject(req: Request): Promise<Subject<Role> | null> {
        const header = req.headers.get("authorization");
        if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
        const token = header.slice(7).trim();
        if (!token) return null;

        try {
            const { payload } = await jwtVerify(token, this._jwks, {
                issuer: this._issuer,
                ...(this._audience !== undefined ? { audience: this._audience } : {}),
            }) as { payload: JWTPayload };
            return this._claimsToSubject(payload as Record<string, unknown>);
        } catch {
            return null;
        }
    }
}
