import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { IntegrationRegistryExactVersionLocation } from "../../../../interfaces/catalog";
import type { FsIntegrationRegistryLayout } from "../persistence/layout";
import { ensureVerifiedRegistryChildDirectory, readVerifiedRegistryDirectory } from "../persistence/ownedDirectory";

export type FsIntegrationRegistryStablePromotionPaths = Readonly<{
    index: string;
    root: string;
    records: string;
    journals: string;
    record: string;
    journal: string;
}>;

export async function ensureStablePromotionPaths(
    layout: FsIntegrationRegistryLayout,
    location: IntegrationRegistryExactVersionLocation,
    operationId: string,
    promotionId: string,
): Promise<FsIntegrationRegistryStablePromotionPaths> {
    assertPathSafeId(operationId, "operation");
    assertPathSafeId(promotionId, "promotion");
    const integrationRoot = await realpath(location.integrationRoot);
    assertWithin(layout.root, integrationRoot);
    if (integrationRoot !== location.integrationRoot) {
        throw new Error("Integration registry promotion root must not traverse symlinks");
    }
    await readVerifiedRegistryDirectory(integrationRoot);
    const metadata = join(integrationRoot, ".registry");
    await readVerifiedRegistryDirectory(metadata);
    const root = await ensureVerifiedRegistryChildDirectory(metadata, "promotions");
    const records = await ensureVerifiedRegistryChildDirectory(root, "records");
    const journals = await ensureVerifiedRegistryChildDirectory(root, "journals");
    return {
        index: join(integrationRoot, "integration.json"),
        root,
        records,
        journals,
        record: join(records, stablePromotionRecordFilename(promotionId)),
        journal: join(journals, `${operationId}.json`),
    };
}

export function stablePromotionRecordFilename(promotionId: string): string {
    return `${createHash("sha256").update(promotionId).digest("hex")}.json`;
}

function assertWithin(root: string, target: string): void {
    const path = relative(root, target);
    if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
        throw new Error("Integration registry stable promotion target escapes the registry root");
    }
}

function assertPathSafeId(value: string, label: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
        throw new TypeError(`Integration registry ${label} ID must be a path-safe identifier`);
    }
}
