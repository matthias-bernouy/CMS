import type { StorageProvider } from "../../exports/StorageProvider";
import type { BucketProxy } from "../../interfaces/entities/BucketProxy";
import { assertValidBucketId } from "../validation/bucket/id";
import { assertValidProviderId } from "../validation/proxy/providerId";
import { assertValidProxyServer } from "../validation/proxy/server";
import { validateRules } from "./rules/validateRules";
import { compileRulesConfig } from "./codegen/compileRulesConfig";
import { applyProxyChanges } from "./applyProxyChanges";

/**
 * Create or update a proxy rule on a bucket. Idempotent: the same
 * `(bucketId, providerId)` pair always replaces in-place.
 *
 * Validation is upfront and total:
 * - `rules` checked by `validateRules` (forbidden headers, glob shape,
 *   `${env:…}`/`${cookie:…}` interpolation whitelist).
 * - Every `${env:NAME}` referenced in `rules` MUST have a matching
 *   entry in `secrets`; missing → reject (otherwise the manifest
 *   builder would throw later, surfacing as an opaque 500).
 * - Every entry in `secrets` MUST be referenced by some `${env:…}` —
 *   no dead keys leaking into the encrypted Mongo doc.
 */
export async function upsertProxy(provider: StorageProvider, proxy: BucketProxy): Promise<void> {
    assertValidBucketId(proxy.bucketId);
    assertValidProviderId(proxy.providerId);
    assertValidProxyServer(proxy.server);
    validateRules(proxy.rules);
    assertSecretCoverage(proxy);

    const bucket = await provider.bucketRepo.get(proxy.bucketId);
    if (!bucket) throw new Error(`Bucket "${proxy.bucketId}" not found.`);

    await provider.bucketProxyRepo.upsert(proxy);
    await applyProxyChanges(provider);
}

const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

function assertSecretCoverage(proxy: BucketProxy): void {
    for (const k of Object.keys(proxy.secrets)) {
        if (!ENV_NAME_RE.test(k)) {
            throw new TypeError(`secrets key "${k}" must match /^[A-Z][A-Z0-9_]*$/.`);
        }
    }
    const compiled = compileRulesConfig(proxy.rules, {
        bucketId:     proxy.bucketId,
        providerId:   proxy.providerId,
        server:       proxy.server,
        emitFallback: true,    // also enumerates defaults' ${env:…} refs
    });
    const referenced = new Set(compiled.secrets.keys());
    for (const ref of referenced) {
        if (!(ref in proxy.secrets)) {
            throw new Error(`rules reference \${env:${ref}} but secrets["${ref}"] is missing.`);
        }
    }
    for (const k of Object.keys(proxy.secrets)) {
        if (!referenced.has(k)) {
            throw new Error(`secrets["${k}"] is set but not referenced by any \${env:…} in rules.`);
        }
    }
}
