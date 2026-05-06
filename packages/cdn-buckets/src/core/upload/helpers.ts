import type { StorageProvider } from "../../exports/StorageProvider";

/** Lowercased extension (without dot) or `null` for hidden / extension-less names. */
export function extractExtension(name: string): string | null {
    const dot = name.lastIndexOf(".");
    if (dot <= 0 || dot === name.length - 1) return null;
    return name.slice(dot + 1).toLowerCase();
}

/** Resolves an absolute public URL using the provider's configured publicHost
 *  (falls back to the production default). */
export function buildPublicURL(provider: StorageProvider, bucketId: string, key: string): string {
    const host = provider.config.publicHost?.(bucketId) ?? `https://${bucketId}.cdn.bernouy.com`;
    return `${host}/${key}`;
}
