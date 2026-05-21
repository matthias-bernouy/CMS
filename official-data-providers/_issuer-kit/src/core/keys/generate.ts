import { generateKeyPair, exportJWK, calculateJwkThumbprint, type JWK } from "jose";
import type { SigningKey } from "src/types/SigningKey";

export interface GeneratedKey extends SigningKey {
    createdAt: number; // epoch seconds
}

/**
 * Generate an ES256 signing key. `kid` = RFC 7638 JWK thumbprint —
 * **deterministic for a given key** (stable across reloads; a new key
 * yields a new kid, so a restart without rotation keeps the same kid only
 * because the same key material is reloaded).
 *
 * `extractable: true` is required so the encrypted-at-rest store can
 * serialize the private key before encrypting it; it is never written in
 * clear.
 */
export async function generateSigningKey(nowSec: number): Promise<GeneratedKey> {
    const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
    const pub = await exportJWK(publicKey);
    const kid = await calculateJwkThumbprint(pub);
    const publicJwk: JWK = { ...pub, kid, alg: "ES256", use: "sig" };
    return { kid, privateKey, publicJwk, createdAt: nowSec };
}
