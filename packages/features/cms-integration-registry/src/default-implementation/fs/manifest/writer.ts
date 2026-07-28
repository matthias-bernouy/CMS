import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { IntegrationPackageLimits, ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import { prepareIntegrationRegistryVersionManifest, type PreparedIntegrationRegistryVersionManifest } from "./contract";
import { ensureIntegrationRegistryManifestDirectory } from "./paths";

export class IntegrationRegistryVersionManifestConflictError extends Error {
    readonly status = 409;

    constructor(readonly path: string) {
        super(`Integration registry version manifest already exists: ${path}`);
        this.name = "IntegrationRegistryVersionManifestConflictError";
    }
}

export type WriteIntegrationRegistryVersionManifestOptions = Readonly<{
    integrationRoot: string;
    package: ResolvedIntegrationPackage;
    limits?: Partial<IntegrationPackageLimits>;
}>;

export type WrittenIntegrationRegistryVersionManifest = PreparedIntegrationRegistryVersionManifest &
    Readonly<{ path: string }>;

export async function writeIntegrationRegistryVersionManifest(
    options: WriteIntegrationRegistryVersionManifestOptions,
): Promise<WrittenIntegrationRegistryVersionManifest> {
    const prepared = await prepareIntegrationRegistryVersionManifest(options.package, options.limits);
    const directory = await ensureIntegrationRegistryManifestDirectory(options.integrationRoot);
    const path = join(directory, `${prepared.package.envelope.version}.json`);
    const temporary = join(directory, `.${prepared.package.envelope.version}.${randomUUID()}.tmp`);
    let created = false;
    try {
        await writeTemporaryManifest(temporary, prepared.documentBytes);
        try {
            await link(temporary, path);
            created = true;
        } catch (error) {
            if (isNodeError(error) && error.code === "EEXIST") {
                throw new IntegrationRegistryVersionManifestConflictError(path);
            }
            throw error;
        }
        await syncDirectory(directory);
        return { ...prepared, path };
    } finally {
        try {
            await unlink(temporary);
            if (created) {
                await syncDirectory(directory);
            }
        } catch (error) {
            if (!isNodeError(error) || error.code !== "ENOENT") {
                throw error;
            }
        }
    }
}

async function writeTemporaryManifest(path: string, bytes: Uint8Array): Promise<void> {
    const handle = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        0o640,
    );
    try {
        await handle.writeFile(bytes);
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.size !== bytes.byteLength) {
            throw new Error("Integration registry version manifest temporary write could not be verified");
        }
        await handle.chmod(0o440);
        await handle.sync();
    } finally {
        await handle.close();
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

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
