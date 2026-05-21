import { z } from "zod";
import { CRYPTO_DEFAULTS, sameOrigin } from "@bernouy/data-provider-contract";
import type { IssuerConfig } from "src/interfaces/IssuerConfig";
import { IssuerError } from "src/core/errors";

const C = CRYPTO_DEFAULTS;
const SUPPORTED: readonly string[] = C.algorithms;

const RawSchema = z.object({
    issuer:            z.string().url(),
    jwksUri:           z.string().url().optional(),
    // Only the contract's supported algorithms — the minter hardcodes ES256,
    // so a free-string list could advertise an algo in the metadoc we never
    // actually sign with (metadoc↔signature drift).
    algorithms:        z.array(z.string()).min(1)
                        .refine((a) => a.every((alg) => SUPPORTED.includes(alg)),
                            { message: `unsupported algorithm (only ${SUPPORTED.join(", ")})` })
                        .default([...C.algorithms]),
    tokenTtlSeconds:   z.number().int().min(C.tokenTtlMin).max(C.tokenTtlMax).default(C.tokenTtlSeconds),
    keyOverlapSeconds: z.number().int().positive().optional(),
});

/**
 * Parse + default. `jwksUri` defaults same-origin; the overlap defaults to
 * `tokenTtlMax + clockSkewMax` (≥ what a verifier could still accept — the
 * publish-before-sign window, base.md §4.8). Fail fast on bad config.
 *
 * No `clockSkewSeconds` here: skew is a **verifier** concern (`jose`'s
 * `clockTolerance` on the SDK side); the signer just stamps `now` for `iat`
 * and `now + ttl` for `exp` — adding a signer-side skew would just back-date
 * `iat`, with no security benefit.
 */
export function parseIssuerConfig(raw: unknown): IssuerConfig {
    const r = RawSchema.safeParse(raw);
    if (!r.success) {
        throw new IssuerError(
            `invalid IssuerConfig — ${r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
        );
    }
    const d = r.data;
    const jwksUri = d.jwksUri ?? `${d.issuer.replace(/\/$/, "")}/jwks.json`;
    if (!sameOrigin(jwksUri, d.issuer)) {
        throw new IssuerError(`jwksUri must be same-origin as issuer (got ${jwksUri})`);
    }
    return {
        issuer:            d.issuer,
        jwksUri,
        algorithms:        d.algorithms,
        tokenTtlSeconds:   d.tokenTtlSeconds,
        keyOverlapSeconds: d.keyOverlapSeconds ?? C.tokenTtlMax + C.clockSkewMax,
    };
}
