import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes } from "../../../../core/canonical/canonicalizeJson";
import {
    ensureReferenceDirectory,
    errorCode,
    existingReferenceDirectory,
    isMissing,
    referenceCoordinatePaths,
    type IntegrationPackageCacheLayout,
} from "../paths";
import {
    IntegrationPackageCacheReferenceConflictError,
    IntegrationPackageCacheReferenceCorruptionError,
    type IntegrationPackageCacheReference,
} from "../types";
import { syncDirectory } from "../writing";
import {
    assertBoundedReferenceFile,
    assertStableReferenceEntry,
    createPackageReference,
    MAX_REFERENCE_BYTES,
    parsePackageReference,
    type ReferenceCoordinate,
    validateReferenceCoordinate,
} from "./referenceDocument";

export async function getPackageReference(
    layout: IntegrationPackageCacheLayout,
    kind: string,
    version: string,
): Promise<IntegrationPackageCacheReference | null> {
    const coordinate = validateReferenceCoordinate(kind, version);
    let directory;
    try {
        directory = await existingReferenceDirectory(layout, coordinate.kind);
    } catch (error) {
        throw corrupt(coordinate, error);
    }
    if (!directory) {
        return null;
    }
    const path = referenceCoordinatePaths(layout, coordinate.kind, coordinate.version).reference;
    let handle;
    try {
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
        if (isMissing(error)) {
            return null;
        }
        throw corrupt(coordinate, error);
    }
    try {
        const before = await handle.stat();
        assertBoundedReferenceFile(before);
        const document = await handle.readFile();
        if (document.byteLength !== before.size || document.byteLength > MAX_REFERENCE_BYTES) {
            throw new Error("reference changed or exceeded its byte limit while being read");
        }
        const reference = parsePackageReference(document, coordinate);
        assertStableReferenceEntry(before, await handle.stat());
        assertStableReferenceEntry(before, await lstat(path));
        return reference;
    } catch (error) {
        throw corrupt(coordinate, error);
    } finally {
        await handle.close();
    }
}

export async function recordPackageReference(
    layout: IntegrationPackageCacheLayout,
    kind: string,
    version: string,
    digest: string,
): Promise<IntegrationPackageCacheReference> {
    const coordinate = validateReferenceCoordinate(kind, version, digest);
    const reference = createPackageReference(coordinate);
    let directory;
    try {
        directory = await ensureReferenceDirectory(layout, coordinate.kind);
        await syncDirectory(layout.references);
    } catch (error) {
        throw corrupt(coordinate, error);
    }
    const destination = referenceCoordinatePaths(layout, coordinate.kind, coordinate.version).reference;
    const temporary = join(directory, `.${coordinate.version}.${randomUUID()}.tmp`);
    try {
        await writeReference(temporary, canonicalJsonBytes(reference));
        try {
            await link(temporary, destination);
            await syncDirectory(directory);
            return reference;
        } catch (error) {
            if (errorCode(error) !== "EEXIST") {
                throw error;
            }
            const existing = await getPackageReference(layout, coordinate.kind, coordinate.version);
            if (!existing) {
                throw new Error("existing reference disappeared during immutable publication");
            }
            if (existing.digest !== reference.digest) {
                throw new IntegrationPackageCacheReferenceConflictError(
                    coordinate.kind,
                    coordinate.version,
                    existing.digest,
                    reference.digest,
                );
            }
            return existing;
        }
    } finally {
        await unlink(temporary).catch((error: unknown) => {
            if (!isMissing(error)) {
                throw error;
            }
        });
        await syncDirectory(directory);
    }
}

async function writeReference(path: string, document: Uint8Array): Promise<void> {
    const handle = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600,
    );
    try {
        await handle.writeFile(document);
        await handle.chmod(0o440);
        await handle.sync();
    } finally {
        await handle.close();
    }
}

function corrupt(coordinate: ReferenceCoordinate, error: unknown): IntegrationPackageCacheReferenceCorruptionError {
    if (error instanceof IntegrationPackageCacheReferenceCorruptionError) {
        return error;
    }
    return new IntegrationPackageCacheReferenceCorruptionError(
        coordinate.kind,
        coordinate.version,
        `Integration package cache reference ${coordinate.kind}@${coordinate.version} is corrupt`,
        { cause: error },
    );
}
