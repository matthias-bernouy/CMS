import { constants, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes } from "../../../../core/canonical/canonicalizeJson";
import { sha256Hex } from "../../../../core/digest";
import { resolveIntegrationPackageLimits } from "../../../../core/envelope/constants";
import { parseIntegrationPackageEnvelope } from "../../../../core/envelope/validate";
import type { IntegrationPackageLimits } from "../../../../interfaces/envelope";
import { assertPackageDigest, assertWithinCache, isMissing, objectPath } from "../paths";
import type { IntegrationPackageCacheLayout } from "../paths";
import { IntegrationPackageCacheCorruptionError, type MaterializedIntegrationPackage } from "../types";
import { assertMaterializedFiles, readBoundedDocument } from "./contents";

export async function verifyCachedPackage(
    layout: IntegrationPackageCacheLayout,
    digest: string,
    limitsInput: Partial<IntegrationPackageLimits> | undefined,
): Promise<MaterializedIntegrationPackage | null> {
    assertPackageDigest(digest);
    const directory = objectPath(layout, digest);
    try {
        const metadata = await lstat(directory);
        assertRealDirectory(metadata, "cached object");
    } catch (error) {
        if (isMissing(error)) {
            return null;
        }
        throw corrupt(digest, error);
    }
    try {
        const verified = await verifyPackageDirectory(layout.objects, directory, digest, limitsInput);
        await normalizeCommittedObjectMode(layout, directory, verified.metadata);
        return verified.package;
    } catch (error) {
        throw corrupt(digest, error);
    }
}

export async function verifyStagedPackage(
    layout: IntegrationPackageCacheLayout,
    directory: string,
    digest: string,
    limitsInput: Partial<IntegrationPackageLimits> | undefined,
): Promise<void> {
    assertPackageDigest(digest);
    await verifyPackageDirectory(layout.staging, directory, digest, limitsInput);
}

type VerifiedPackageDirectory = {
    package: MaterializedIntegrationPackage;
    metadata: Stats;
};

async function verifyPackageDirectory(
    containmentRoot: string,
    directory: string,
    digest: string,
    limitsInput: Partial<IntegrationPackageLimits> | undefined,
): Promise<VerifiedPackageDirectory> {
    const directoryMetadata = await lstat(directory);
    assertRealDirectory(directoryMetadata, "cached package object");
    const canonicalDirectory = await realpath(directory);
    assertWithinCache(containmentRoot, canonicalDirectory);
    assertSameEntry(directoryMetadata, await lstat(canonicalDirectory), "cached package object");
    const limits = resolveIntegrationPackageLimits(limitsInput);
    const document = await readBoundedDocument(join(canonicalDirectory, "package.json"), limits.maxDocumentBytes);
    const envelope = parseIntegrationPackageEnvelope(document, { limits });
    const canonicalBytes = canonicalJsonBytes(envelope);
    if (!equalBytes(document, canonicalBytes)) {
        throw new Error("cached package document is not canonical JSON");
    }
    if ((await sha256Hex(canonicalBytes)) !== digest) {
        throw new Error("cached package digest does not match its object path");
    }
    const root = join(canonicalDirectory, "root");
    const rootMetadata = await lstat(root);
    assertRealDirectory(rootMetadata, "cached package root");
    const canonicalRoot = await realpath(root);
    assertWithinCache(canonicalDirectory, canonicalRoot);
    assertSameEntry(rootMetadata, await lstat(canonicalRoot), "cached package root");
    await assertMaterializedFiles(canonicalRoot, envelope.files, limits);
    const after = await lstat(directory);
    assertStableEntry(directoryMetadata, after, "cached package object");
    return { package: { root: canonicalRoot, digest, envelope }, metadata: after };
}

async function normalizeCommittedObjectMode(
    layout: IntegrationPackageCacheLayout,
    directory: string,
    expected: Stats,
): Promise<void> {
    if ((expected.mode & 0o777) === 0o550) {
        return;
    }
    const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        const current = await handle.stat();
        assertSameEntry(expected, current, "cached package object");
        await handle.chmod(0o550);
        await handle.sync();
    } finally {
        await handle.close();
    }
    await syncDirectory(layout.objects);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function assertRealDirectory(metadata: Stats, source: string): void {
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`${source} must be a real directory`);
    }
}

function assertSameEntry(expected: Stats, actual: Stats, source: string): void {
    if (expected.dev !== actual.dev || expected.ino !== actual.ino) {
        throw new Error(`${source} changed while being verified`);
    }
}

function assertStableEntry(expected: Stats, actual: Stats, source: string): void {
    assertSameEntry(expected, actual, source);
    if (expected.mtimeMs !== actual.mtimeMs || expected.ctimeMs !== actual.ctimeMs) {
        throw new Error(`${source} changed while being verified`);
    }
}

async function syncDirectory(path: string): Promise<void> {
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
}

function corrupt(digest: string, error: unknown): IntegrationPackageCacheCorruptionError {
    return new IntegrationPackageCacheCorruptionError(digest, `Integration package cache object ${digest} is corrupt`, {
        cause: error,
    });
}
