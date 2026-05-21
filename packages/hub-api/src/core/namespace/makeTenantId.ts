/** Build a globally-unique RFC 1123 tenant id from a namespace + provider.
 *  Shape: `<namespaceId>-<providerId>-<8 random base36>` truncated to ≤63. */
export function makeTenantId(namespaceId: string, providerId: string): string {
    const rand = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
    const base = `${namespaceId}-${providerId}`.slice(0, 63 - 9);
    return `${base}-${rand}`;
}
