import { lstat, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { manifestDocumentByteLimit } from "../../../manifest/contract";
import { readIntegrationRegistryVersionManifest } from "../../../manifest/reader";
import { syncDirectory, writeCanonicalJsonNoReplace } from "../../persistence/canonicalFile";
import type { FsIntegrationRegistryPublicationJournal } from "../../persistence/journal";
import { publicationPaths, type FsIntegrationRegistryLayout } from "../../persistence/layout";
import { assertVerifiedRegistryDirectory, chmodVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { readCompatibilityAdmissionReport, writeCompatibilityAdmissionReport } from "../../persistence/report";
import { removeImmutableTreeIfExists } from "../../persistence/tree";
import { quarantineRegistryPath } from "../quarantine";
import { pathExists, validateRecoveryJournal, verifyRecoveryPackageRoot } from "../validation";

export async function ensureLiveVersion(
    layout: FsIntegrationRegistryLayout,
    paths: ReturnType<typeof publicationPaths>,
    candidate: Awaited<ReturnType<typeof validateRecoveryJournal>>,
    operationId: string,
): Promise<void> {
    if (await pathExists(paths.versionRoot)) {
        try {
            await verifyRecoveryPackageRoot(paths.versionRoot, candidate);
            await removeImmutableTreeIfExists(paths.stagingRoot);
            return;
        } catch (error) {
            if (!(await pathExists(paths.stagingRoot))) {
                throw error;
            }
            await verifyRecoveryPackageRoot(paths.stagingRoot, candidate);
            await quarantineRegistryPath(layout, operationId, "corrupt-version", paths.versionRoot);
        }
    } else {
        await verifyRecoveryPackageRoot(paths.stagingRoot, candidate);
    }
    const stagingParent = await lstat(dirname(paths.stagingRoot));
    const versionsParent = await lstat(paths.versionsRoot);
    if (stagingParent.dev !== versionsParent.dev) {
        throw new Error("Integration registry recovery cannot rename across filesystems");
    }
    const stagingIdentity = await chmodVerifiedRegistryDirectory(paths.stagingRoot, 0o750);
    await rename(paths.stagingRoot, paths.versionRoot);
    await assertVerifiedRegistryDirectory(paths.versionRoot, stagingIdentity);
    await chmodVerifiedRegistryDirectory(paths.versionRoot, 0o550, stagingIdentity);
    await syncDirectory(dirname(paths.stagingRoot));
    await syncDirectory(paths.versionsRoot);
}

export async function ensureManifest(
    layout: FsIntegrationRegistryLayout,
    paths: ReturnType<typeof publicationPaths>,
    candidate: Awaited<ReturnType<typeof validateRecoveryJournal>>,
    operationId: string,
): Promise<void> {
    try {
        const existing = await readIntegrationRegistryVersionManifest({
            path: paths.manifest,
            integrationRoot: paths.integrationRoot,
            expectedKind: candidate.definition.kind,
            expectedVersion: candidate.package.envelope.version,
            limits: candidate.limits,
        });
        if (existing) {
            if (existing.digest !== candidate.package.digest) {
                throw new Error("Recovered integration manifest has a different digest");
            }
            return;
        }
    } catch {
        await quarantineRegistryPath(layout, operationId, "corrupt-manifest", paths.manifest);
    }
    await writeCanonicalJsonNoReplace(
        paths.manifest,
        candidate.manifest.document,
        manifestDocumentByteLimit(candidate.limits),
    );
}

export async function ensureReport(
    layout: FsIntegrationRegistryLayout,
    paths: ReturnType<typeof publicationPaths>,
    journal: FsIntegrationRegistryPublicationJournal,
    operationId: string,
): Promise<void> {
    try {
        const existing = await readCompatibilityAdmissionReport(paths.report, {
            kind: journal.kind,
            version: journal.version,
            digest: journal.digest,
        });
        if (existing) {
            if (!sameJson(existing, journal.report)) {
                throw new Error("Recovered integration admission report differs from its publication journal");
            }
            return;
        }
    } catch {
        await quarantineRegistryPath(layout, operationId, "corrupt-report", paths.report);
    }
    await writeCompatibilityAdmissionReport(paths.report, journal.report);
}

function sameJson(left: unknown, right: unknown): boolean {
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}
