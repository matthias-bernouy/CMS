import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { FsIntegrationRegistryLayout } from "../persistence/layout";
import { ensureFsIntegrationRegistryLayout } from "../persistence/layout";
import { ensureVerifiedRegistryChildDirectory, readVerifiedRegistryDirectory } from "../persistence/ownedDirectory";

export const FS_INTEGRATION_REGISTRY_CANDIDATE_DOCUMENT_LIMIT = 64 * 1_024;
export const FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT = 1_048_576;
export const FS_INTEGRATION_REGISTRY_CANDIDATE_INVENTORY_LIMIT = 4_096;
export const FS_INTEGRATION_REGISTRY_CANDIDATE_GLOBAL_OBJECT_LIMIT = 16_384;

export type FsIntegrationRegistryCandidateLayout = Readonly<{
    registry: FsIntegrationRegistryLayout;
    root: string;
    packages: string;
    verifications: string;
    policies: string;
    admissions: string;
    compatibilityReports: string;
    statefulSelections: string;
    migrationInputs: string;
    results: string;
    records: string;
    pruning: string;
    pruned: string;
}>;

export async function ensureFsIntegrationRegistryCandidateLayout(
    requestedRoot: string,
): Promise<FsIntegrationRegistryCandidateLayout> {
    const registry = await ensureFsIntegrationRegistryLayout(requestedRoot);
    const metadata = await ensureFixedChildDirectory(registry.root, ".registry");
    const root = await ensureVerifiedRegistryChildDirectory(metadata, "candidates");
    const objects = await ensureVerifiedRegistryChildDirectory(root, "objects");
    return {
        registry,
        root,
        packages: await ensureVerifiedRegistryChildDirectory(objects, "packages"),
        verifications: await ensureVerifiedRegistryChildDirectory(objects, "verifications"),
        policies: await ensureVerifiedRegistryChildDirectory(objects, "policies"),
        admissions: await ensureVerifiedRegistryChildDirectory(objects, "admissions"),
        compatibilityReports: await ensureVerifiedRegistryChildDirectory(objects, "compatibility-reports"),
        statefulSelections: await ensureVerifiedRegistryChildDirectory(objects, "stateful-selections"),
        migrationInputs: await ensureVerifiedRegistryChildDirectory(objects, "migration-inputs"),
        results: await ensureVerifiedRegistryChildDirectory(objects, "results"),
        records: await ensureVerifiedRegistryChildDirectory(root, "records"),
        pruning: await ensureVerifiedRegistryChildDirectory(root, "pruning"),
        pruned: await ensureVerifiedRegistryChildDirectory(root, "pruned"),
    };
}

export function candidatePackagePath(layout: FsIntegrationRegistryCandidateLayout, digest: string): string {
    assertSha256Digest(digest);
    return join(layout.packages, `${digest}.json`);
}

export function candidateVerificationPath(layout: FsIntegrationRegistryCandidateLayout, digest: string): string {
    assertSha256Digest(digest);
    return join(layout.verifications, `${digest}.json`);
}

export function candidatePolicyPath(layout: FsIntegrationRegistryCandidateLayout, digest: string): string {
    assertSha256Digest(digest);
    return join(layout.policies, `${digest}.json`);
}

export function candidateAdmissionPath(layout: FsIntegrationRegistryCandidateLayout, digest: string): string {
    assertSha256Digest(digest);
    return join(layout.admissions, `${digest}.json`);
}

export function candidateResultPath(layout: FsIntegrationRegistryCandidateLayout, digest: string): string {
    assertSha256Digest(digest);
    return join(layout.results, `${digest}.json`);
}

export function candidateMigrationInputPath(layout: FsIntegrationRegistryCandidateLayout, digest: string): string {
    assertSha256Digest(digest);
    return join(layout.migrationInputs, `${digest}.json`);
}

export function candidateCompatibilityReportPath(layout: FsIntegrationRegistryCandidateLayout, digest: string): string {
    assertSha256Digest(digest);
    return join(layout.compatibilityReports, `${digest}.json`);
}

export function candidateStatefulSelectionPath(layout: FsIntegrationRegistryCandidateLayout, digest: string): string {
    assertSha256Digest(digest);
    return join(layout.statefulSelections, `${digest}.json`);
}

export function candidateRecordRoot(layout: FsIntegrationRegistryCandidateLayout, candidateId: string): string {
    assertCandidateId(candidateId);
    return join(layout.records, candidateId);
}

export function candidateRevisionPath(
    layout: FsIntegrationRegistryCandidateLayout,
    candidateId: string,
    revision: number,
): string {
    assertCandidateRevision(revision);
    return join(candidateRecordRoot(layout, candidateId), `${revision.toString().padStart(16, "0")}.json`);
}

export function assertCandidateId(value: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
        throw new TypeError("Integration registry candidate ID must be a path-safe identifier");
    }
}

export function assertSha256Digest(value: string): void {
    if (!/^[a-f0-9]{64}$/u.test(value)) {
        throw new TypeError("Integration registry candidate digest must be lowercase SHA-256");
    }
}

export function assertCandidateRevision(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError("Integration registry candidate revision must be a non-negative safe integer");
    }
}

async function ensureFixedChildDirectory(parent: string, name: string): Promise<string> {
    await readVerifiedRegistryDirectory(parent);
    const path = join(parent, name);
    try {
        await mkdir(path, { mode: 0o750 });
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
    }
    await readVerifiedRegistryDirectory(path);
    return path;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
