import type { JWK } from "jose";
import type { KeyStore } from "src/interfaces/KeyStore";

/**
 * The JWKS served at `jwks_uri`: every published key (active + retired
 * still within the overlap window — base.md §4.8 publish-before-sign).
 * `KeyStore.loadAll()` already enforces the overlap/prune.
 */
export async function buildJwks(keyStore: KeyStore): Promise<{ keys: JWK[] }> {
    const keys = await keyStore.loadAll();
    return { keys: keys.map((k) => k.publicJwk) };
}
