import type { InstallationServices } from "@bernouy/cms-repository/features/installations";
/** Unit cases supply only ports they exercise; any accidental extra call fails loudly. */
export function services(ports: Record<string, unknown> = {}): InstallationServices {
    return new Proxy(ports, {
        get(target, key) {
            if (Object.hasOwn(target, key)) {
                return Reflect.get(target, key);
            }
            throw new Error(`Unexpected installation service: ${String(key)}`);
        },
    }) as unknown as InstallationServices;
}
export const context = {
    requestId: "local",
    contractVersion: "1.0.0",
    siteId: "site-a",
    providerId: "ulvia/primary-provider",
};
export const reference = {
    repositoryId: "official",
    publisherId: "ulvia",
    collectionId: "ulvia/starter",
    version: "1.0.0",
    digest: "sha256:" + "a".repeat(64),
    approvedBrowserRiskDigest: "sha256:" + "b".repeat(64),
};
