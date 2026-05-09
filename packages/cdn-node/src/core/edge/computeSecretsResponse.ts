import { createHash } from "node:crypto";

import { buildSecretsManifest } from "@bernouy/cdn-buckets";
import type { BucketProxyRepository } from "@bernouy/cdn-buckets";

/**
 * Build the manifest payload served to edges + a deterministic ETag.
 *
 * The ETag is a 32-hex-char prefix of the sha256 of a canonical JSON
 * encoding of the manifest (keys sorted). Two manifests with the same
 * content always produce the same ETag, which is exactly what the
 * conditional-GET round-trip needs to stay correct across regen passes.
 */
export async function computeSecretsResponse(bucketProxyRepo: BucketProxyRepository): Promise<{ manifest: Record<string, string>; etag: string }> {
    const proxies  = await bucketProxyRepo.listAll();
    const manifest = buildSecretsManifest(proxies);
    const etag     = computeEtag(manifest);
    return { manifest, etag };
}

function computeEtag(manifest: Record<string, string>): string {
    const sortedKeys = Object.keys(manifest).sort();
    const canonical: Record<string, string> = {};
    for (const k of sortedKeys) canonical[k] = manifest[k]!;
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32);
}
