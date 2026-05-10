import type { BucketProxy } from "../../interfaces/entities/BucketProxy";
import { compileRulesConfig } from "./codegen/compileRulesConfig";

/**
 * Flatten a list of proxies into the placeholder→plaintext map shipped
 * to edges via `/edge-api/secrets`. Each edge exports the entries as
 * env vars (in tmpfs, never persisted) and `os.getenv` reads them at
 * request time inside the per-location `set_by_lua_block`.
 *
 * For each proxy we re-compile its `rules` to recover the deterministic
 * `envName → placeholder` mapping (same input → same hashes via
 * `placeholderName`), then look up the matching plaintext in
 * `proxy.secrets`. Missing entries are an upstream validation bug
 * (`upsertProxy` rejects writes that don't cover every `${env:X}`),
 * but we throw loudly here too so a regression doesn't ship empty
 * secrets to edges.
 *
 * Throws on a placeholder collision with differing values — would only
 * happen on a hash collision, but cheap to assert.
 */
export function buildSecretsManifest(proxies: BucketProxy[]): Record<string, string> {
    const manifest: Record<string, string> = {};
    for (const proxy of proxies) {
        // `emitFallback: true` ensures `defaults` rules run through the
        // emitter once even when `paths` is empty, so their `${env:…}`
        // interpolations get registered in the secrets map.
        const compiled = compileRulesConfig(proxy.rules, {
            bucketId:     proxy.bucketId,
            providerId:   proxy.providerId,
            server:       proxy.server,
            emitFallback: true,
        });
        for (const [envName, placeholder] of compiled.secrets) {
            const plaintext = proxy.secrets[envName];
            if (plaintext === undefined) {
                throw new Error(
                    `buildSecretsManifest: proxy "${proxy.bucketId}/${proxy.providerId}" references ` +
                    `\${env:${envName}} but no entry in proxy.secrets.`,
                );
            }
            const existing = manifest[placeholder];
            if (existing !== undefined && existing !== plaintext) {
                throw new Error(`buildSecretsManifest: placeholder collision on "${placeholder}".`);
            }
            manifest[placeholder] = plaintext;
        }
    }
    return manifest;
}
