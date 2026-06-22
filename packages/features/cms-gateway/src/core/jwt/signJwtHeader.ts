import { importJWK, importPKCS8, SignJWT, type JWK } from "jose";
import type { JwtHeaderSource } from "../../interfaces/Gateway";
import { resolveJwtClaims, type ResolveJwtClaimsDeps } from "./claims";

export type SignJwtHeaderDeps = ResolveJwtClaimsDeps & {
    resolveSecret?: (ref: string) => Promise<string | undefined>;
};

export type SignJwtHeaderResult =
    | { ok: true; value: string }
    | { ok: false; status: 401 | 500; message: string };

export async function signJwtHeaderValue(
    source: JwtHeaderSource,
    request: Request,
    deps: SignJwtHeaderDeps,
): Promise<SignJwtHeaderResult> {
    const alg = source.alg ?? "RS256";
    if (alg !== "RS256") {
        return { ok: false, status: 500, message: `jwt algorithm not wired yet: ${alg}` };
    }
    if (!deps.resolveSecret) {
        return { ok: false, status: 500, message: "jwt header requires a configured secret store" };
    }

    const keyMaterial = await deps.resolveSecret(source.signingKeyRef);
    if (keyMaterial == null) {
        return { ok: false, status: 500, message: `secret not found: ${source.signingKeyRef}` };
    }

    const claims = await resolveJwtClaims(source.claims, request, deps);
    if (!claims.ok) return claims;

    const key = await importRs256PrivateKey(keyMaterial);
    if (!key.ok) return key;

    const ttl = source.ttlSeconds ?? 300;
    const jwt = await new SignJWT(claims.claims)
        .setProtectedHeader(source.kid ? { alg, kid: source.kid } : { alg })
        .setIssuedAt()
        .setExpirationTime(`${ttl}s`)
        .sign(key.value);

    return { ok: true, value: `${source.prefix ?? ""}${jwt}` };
}

type KeyResult =
    | { ok: true; value: CryptoKey | Uint8Array }
    | { ok: false; status: 500; message: string };

async function importRs256PrivateKey(value: string): Promise<KeyResult> {
    try {
        const trimmed = value.trim();
        if (trimmed.startsWith("{")) {
            return { ok: true, value: await importJWK(JSON.parse(trimmed) as JWK, "RS256") };
        }
        return { ok: true, value: await importPKCS8(trimmed, "RS256") };
    } catch {
        return { ok: false, status: 500, message: "invalid jwt signing key" };
    }
}
