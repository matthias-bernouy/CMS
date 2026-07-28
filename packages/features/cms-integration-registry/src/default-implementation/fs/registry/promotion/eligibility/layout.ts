import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { IntegrationRegistryExactVersionLocation } from "../../../../../interfaces/catalog";
import type { FsIntegrationRegistryLayout } from "../../persistence/layout";
import { ensureVerifiedRegistryChildDirectory, readVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";

export type FsIntegrationRegistryVersionEligibilityPaths = Readonly<{
    index: string;
    root: string;
    records: string;
    journals: string;
    record: string;
    journal: string;
}>;

export type FsIntegrationRegistryVersionEligibilityStoragePaths = Pick<
    FsIntegrationRegistryVersionEligibilityPaths,
    "index" | "journals" | "records" | "root"
>;

export async function ensureVersionEligibilityPaths(
    layout: FsIntegrationRegistryLayout,
    location: IntegrationRegistryExactVersionLocation,
    operationId: string,
    recordId: string,
): Promise<FsIntegrationRegistryVersionEligibilityPaths> {
    assertPathSafeId(operationId, "operation");
    assertPathSafeId(recordId, "record");
    const integrationRoot = await realpath(location.integrationRoot);
    assertWithin(layout.root, integrationRoot);
    if (integrationRoot !== location.integrationRoot) {
        throw new Error("Integration registry eligibility root must not traverse symlinks");
    }
    await readVerifiedRegistryDirectory(integrationRoot);
    const metadata = join(integrationRoot, ".registry");
    await readVerifiedRegistryDirectory(metadata);
    const root = await ensureVerifiedRegistryChildDirectory(metadata, "eligibility");
    const records = await ensureVerifiedRegistryChildDirectory(root, "records");
    const journals = await ensureVerifiedRegistryChildDirectory(root, "journals");
    return versionEligibilityPaths(
        { index: join(integrationRoot, "integration.json"), root, records, journals },
        operationId,
        recordId,
    );
}

export function versionEligibilityStoragePaths(
    integrationRoot: string,
): FsIntegrationRegistryVersionEligibilityStoragePaths {
    const root = join(integrationRoot, ".registry", "eligibility");
    return {
        index: join(integrationRoot, "integration.json"),
        root,
        records: join(root, "records"),
        journals: join(root, "journals"),
    };
}

export function versionEligibilityPaths(
    storage: FsIntegrationRegistryVersionEligibilityStoragePaths,
    operationId: string,
    recordId: string,
): FsIntegrationRegistryVersionEligibilityPaths {
    assertPathSafeId(operationId, "operation");
    assertPathSafeId(recordId, "record");
    return {
        ...storage,
        record: join(storage.records, `${createHash("sha256").update(recordId).digest("hex")}.json`),
        journal: join(storage.journals, `${operationId}.json`),
    };
}

function assertWithin(root: string, target: string): void {
    const path = relative(root, target);
    if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
        throw new Error("Integration registry eligibility target escapes the registry root");
    }
}

function assertPathSafeId(value: string, label: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
        throw new TypeError(`Integration registry eligibility ${label} ID must be a path-safe identifier`);
    }
}
