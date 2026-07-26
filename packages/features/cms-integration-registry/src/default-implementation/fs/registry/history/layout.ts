import { createHash } from "node:crypto";
import { join } from "node:path";
import type { IntegrationRegistryExactVersionLocation } from "../../../../interfaces/catalog";
import { ensureVerifiedRegistryChildDirectory, readVerifiedRegistryDirectory } from "../persistence/ownedDirectory";

export type FsIntegrationCompatibilityHistoryPaths = Readonly<{
    root: string;
    admission: string;
    revisions: string;
}>;

export function integrationCompatibilityHistoryPaths(
    location: IntegrationRegistryExactVersionLocation,
): FsIntegrationCompatibilityHistoryPaths {
    const root = join(location.integrationRoot, ".registry", "reports", location.version);
    return { root, admission: join(root, "admission.json"), revisions: join(root, "revisions") };
}

export async function ensureIntegrationCompatibilityRevisionDirectory(
    paths: FsIntegrationCompatibilityHistoryPaths,
): Promise<string> {
    await readVerifiedRegistryDirectory(paths.root);
    return await ensureVerifiedRegistryChildDirectory(paths.root, "revisions");
}

export function integrationCompatibilityRevisionFilename(reportId: string): string {
    return `${createHash("sha256").update(reportId).digest("hex")}.json`;
}
