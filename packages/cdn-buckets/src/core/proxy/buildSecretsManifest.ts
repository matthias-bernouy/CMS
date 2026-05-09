import type { BucketProxy } from "../../interfaces/entities/BucketProxy";
import { placeholderName } from "./placeholderName";

/**
 * Flatten a list of proxies into the placeholder→plaintext map shipped
 * to edges via `/edge-api/secrets`. The map is the single source of
 * truth at edge reload time: `envsubst` replaces every `${SECRET_xxx}`
 * placeholder in the synced nginx fragment using these values.
 *
 * Proxies with `auth.type === 'none'` contribute nothing — their nginx
 * location block doesn't need `proxy_set_header Authorization` at all,
 * so no placeholder is emitted on either side.
 *
 * Throws if the same placeholder name would map to two different values
 * (would only happen on a hash collision; included so a future
 * regression surfaces loud and immediately).
 */
export function buildSecretsManifest(proxies: BucketProxy[]): Record<string, string> {
    const manifest: Record<string, string> = {};
    for (const proxy of proxies) {
        if (proxy.auth.type === "none") continue;
        if (proxy.auth.type === "bearer") {
            assignNew(manifest, placeholderName(proxy.bucketId, proxy.providerId, 0), proxy.auth.token);
            continue;
        }
        // headers
        proxy.auth.headers.forEach((h, i) => {
            assignNew(manifest, placeholderName(proxy.bucketId, proxy.providerId, i), h.value);
        });
    }
    return manifest;
}

function assignNew(manifest: Record<string, string>, key: string, value: string): void {
    const existing = manifest[key];
    if (existing !== undefined && existing !== value) {
        throw new Error(`buildSecretsManifest: placeholder collision on "${key}" with differing values.`);
    }
    manifest[key] = value;
}
