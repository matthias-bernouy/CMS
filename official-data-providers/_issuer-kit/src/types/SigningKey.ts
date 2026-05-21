import type { JWK } from "jose";

/**
 * Key material. The private key is a Web Crypto `CryptoKey` (extractable so
 * the encrypted-at-rest store can persist it; never written in clear).
 * `publicJwk` uses jose's `JWK` (DOM `JsonWebKey` has no `kid`).
 */
export interface SigningKey {
    kid:        string;
    privateKey: CryptoKey;
    publicJwk:  JWK;
}

/** What goes into the published JWKS (+ lifecycle for the overlap window). */
export interface PublishedKey {
    kid:        string;
    publicJwk:  JWK;
    createdAt:  number;            // epoch seconds
    retiredAt?: number;            // set when rotated out; pruned after overlap
}
