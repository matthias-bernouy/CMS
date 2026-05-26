import { jwtVerify, decodeJwt, decodeProtectedHeader } from "jose";
import type { ProviderConfig, AllowlistRole } from "src/interfaces/ProviderConfig";
import type { IssuerTrust } from "src/interfaces/IssuerTrust";
import type { JtiStore } from "src/interfaces/JtiStore";
import type { TokenClaims, TokenScope } from "src/types/claims";
import { TokenClaimsSchema } from "src/core/schemas/claims";
import { AuthError } from "src/core/errors";
import { createDiscovery } from "src/core/auth/discovery";
import { createJwksProvider } from "src/core/auth/jwks";

export interface VerifiedAuth {
    claims: TokenClaims;
    role:   AllowlistRole;
    scope:  TokenScope;
}

export interface VerifierDeps {
    config:      ProviderConfig;
    issuerTrust: IssuerTrust;
    jti:         JtiStore;
    now:         () => number; // epoch seconds
    onSecurity?: (reason: string, ctx: Record<string, unknown>) => void;
}

function bearer(
    authHeader: string | null,
    sec: (reason: string, ctx: Record<string, unknown>) => void,
): string {
    const m = /^Bearer[ ]+(.+)$/i.exec(authHeader ?? "");
    if (!m || !m[1]) {
        sec("bearer_missing", { hasAuthHeader: authHeader !== null });
        throw new AuthError();
    }
    return m[1].trim();
}

/**
 * §4.5 verification, in the imposed order. Every reject is an opaque
 * `AuthError` (detail stays generic — base.md §6) while `onSecurity`
 * receives the precise context for server logs.
 */
export function createVerifier(deps: VerifierDeps) {
    const sec = deps.onSecurity ?? (() => {});
    const supportedMajor = String(deps.config.supportedContractVersion).split(".")[0] ?? "";
    const discover = createDiscovery({ supportedMajor, now: deps.now, onSecurity: deps.onSecurity });
    const jwks     = createJwksProvider();
    const { providerId, crypto } = deps.config;

    return async function verify(authHeader: string | null): Promise<VerifiedAuth> {
        // 1. Bearer
        const token = bearer(authHeader, sec);

        // 2. alg allowlist (anti alg-confusion, before any key work)
        let kid: string | undefined;
        try {
            const h = decodeProtectedHeader(token);
            kid = h.kid;
            if (!h.alg || !crypto.algorithms.includes(h.alg)) {
                sec("alg_not_allowed", { alg: h.alg }); throw new AuthError();
            }
        } catch (e) { if (e instanceof AuthError) throw e; throw new AuthError(); }

        // 3. iss in allowlist (role derived here, not from a claim)
        let iss: string;
        try { iss = String(decodeJwt(token).iss ?? ""); }
        catch { throw new AuthError(); }
        const trust = await deps.issuerTrust.lookup(iss);
        if (!trust) { sec("iss_not_trusted", { iss }); throw new AuthError(); }

        // 4. discovery (SSRF + contract version) + signature/aud/exp/iat
        const meta = await discover(iss);
        const opts = {
            issuer:         iss,
            audience:       providerId,
            algorithms:     crypto.algorithms,
            clockTolerance: crypto.clockSkewSeconds,
            currentDate:    new Date(deps.now() * 1000),
            requiredClaims: ["iat", "exp", "jti"],
        };
        let payload: unknown;
        try {
            payload = (await jwtVerify(token, jwks.get(meta.jwksUri), opts)).payload;
        } catch (e1) {
            // Unknown/rotated `kid`: one forced JWKS refresh + retry, bounded
            // by the short negative cache (base.md §4.4/§4.8 — no false 401).
            if (jwks.forceRefresh(meta.jwksUri)) {
                try {
                    payload = (await jwtVerify(token, jwks.get(meta.jwksUri), opts)).payload;
                } catch (e2) {
                    sec("verify_failed", { iss, kid, aud: providerId, err: String(e2) });
                    throw new AuthError();
                }
            } else {
                sec("verify_failed", { iss, kid, aud: providerId, err: String(e1) });
                throw new AuthError();
            }
        }

        const parsed = TokenClaimsSchema.safeParse(payload);
        if (!parsed.success) { sec("claims_shape", { iss }); throw new AuthError(); }
        const claims = parsed.data as TokenClaims;

        // jose checks exp with clockTolerance; it does NOT reject a future
        // `iat`. base.md §4.5/§4.6 wants iat valid within skew.
        if (claims.iat - deps.now() > crypto.clockSkewSeconds) {
            sec("iat_future", { iss, iat: claims.iat }); throw new AuthError();
        }

        // 5. jti replay — atomic claim (single-use even under concurrency)
        if (!(await deps.jti.claim(claims.jti, claims.exp))) {
            sec("replay", { iss, jti: claims.jti }); throw new AuthError();
        }

        // 6. scope from sub
        const scope: TokenScope = claims.sub ? "user" : "tenant";
        return { claims, role: trust.role, scope };
    };
}
