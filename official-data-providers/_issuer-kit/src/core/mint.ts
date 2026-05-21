import { SignJWT } from "jose";
import { CRYPTO_DEFAULTS } from "@bernouy/data-provider-contract";
import type { KeyStore } from "src/interfaces/KeyStore";
import type { IssuerConfig } from "src/interfaces/IssuerConfig";
import type { MintInput } from "src/types/MintInput";
import { IssuerError } from "src/core/errors";

export interface Minter {
    mint(input: MintInput): Promise<string>;
}

/**
 * Forge a signed JWT exactly as `_sdk` `verifyToken` expects (base.md
 * §4.3/§4.6): header `{alg:ES256, kid:active}`, claims `iss`/`aud`/`iat`/
 * `exp`/`jti` + optional `sub`. **No `role` claim** (derived provider-side,
 * §4.7). TTL clamped to the SHARED contract max — an issuer must not emit
 * long-lived tokens (§4.8). Clock injected (deterministic, skew-aligned).
 */
export function createMinter(deps: {
    keyStore: KeyStore;
    config:   IssuerConfig;
    now:      () => number;        // epoch seconds
}): Minter {
    return {
        async mint(input: MintInput): Promise<string> {
            const ttl = input.ttlSeconds ?? deps.config.tokenTtlSeconds;
            if (ttl > CRYPTO_DEFAULTS.tokenTtlMax || ttl <= 0) {
                throw new IssuerError(
                    `ttlSeconds ${ttl} outside contract bound (1..${CRYPTO_DEFAULTS.tokenTtlMax})`,
                );
            }
            const { kid, privateKey } = await deps.keyStore.loadActive();
            const iat = deps.now();
            const jwt = new SignJWT({})
                .setProtectedHeader({ alg: "ES256", kid })
                .setIssuer(input.iss)
                .setAudience(input.aud)
                .setIssuedAt(iat)
                .setExpirationTime(iat + ttl)
                .setJti(crypto.randomUUID());
            if (input.sub !== undefined) jwt.setSubject(input.sub);
            return jwt.sign(privateKey);
        },
    };
}
