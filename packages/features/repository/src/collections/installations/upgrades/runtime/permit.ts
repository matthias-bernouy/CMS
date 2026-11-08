import { usageDigest } from "../usage/snapshot";
import type { CollectionInstallation } from "../../interfaces/store";

const permits = new WeakMap<
    object,
    Readonly<{ siteId: string; expectedRevision: number; digest: string; assertLease(): Promise<void> }>
>();
export type CollectionUpgradePermit = Readonly<{ readonly purpose: "collection-upgrade" }>;
export function issueUpgradePermit(
    siteId: string,
    expectedRevision: number,
    replacements: readonly CollectionInstallation[],
    assertLease: () => Promise<void>,
): CollectionUpgradePermit {
    const permit = Object.freeze({ purpose: "collection-upgrade" as const });
    permits.set(permit, { siteId, expectedRevision, digest: usageDigest(replacements), assertLease });
    return permit;
}
export async function assertUpgradePermit(
    permit: CollectionUpgradePermit,
    siteId: string,
    expectedRevision: number,
    replacements: readonly CollectionInstallation[],
): Promise<void> {
    const authority = permits.get(permit);
    if (
        !authority ||
        authority.siteId !== siteId ||
        authority.expectedRevision !== expectedRevision ||
        authority.digest !== usageDigest(replacements)
    ) {
        throw Object.assign(new Error("A current reviewed collection upgrade plan is required"), { status: 409 });
    }
    await authority.assertLease();
}
