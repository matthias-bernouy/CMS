import { constants } from "node:fs";
import { chmod, mkdir, mkdtemp, open, utimes } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalJsonBytes } from "../../../core/canonical/canonicalizeJson";
import { sha256Hex } from "../../../core/digest";
import { decodeIntegrationPackageFile } from "../../../core/envelope/encoding";
import { validateIntegrationPackageEnvelope } from "../../../core/envelope/validate";
import type { IntegrationPackageLimits } from "../../../interfaces/envelope";
import type { ResolvedIntegrationPackage } from "../../../interfaces/source";
import { removeCacheTree } from "./cleanup";
import { assertWithinCache } from "./paths";
import type { IntegrationPackageCacheLayout } from "./paths";
import type { ExpectedIntegrationPackageIdentity } from "./types";
import { verifyStagedPackage } from "./verification";

export type PreparedIntegrationPackage = ResolvedIntegrationPackage & {
    readonly canonicalBytes: Uint8Array;
};

export async function prepareIntegrationPackage(
    input: ResolvedIntegrationPackage,
    expected: ExpectedIntegrationPackageIdentity,
    limits: Partial<IntegrationPackageLimits> | undefined,
): Promise<PreparedIntegrationPackage> {
    const envelope = validateIntegrationPackageEnvelope(input.envelope, { limits });
    const canonicalBytes = canonicalJsonBytes(envelope);
    if (!equalBytes(canonicalBytes, input.canonicalBytes)) {
        throw new Error("Integration package source bytes are not the canonical envelope");
    }
    const digest = await sha256Hex(canonicalBytes);
    if (input.digest !== digest || (expected.digest !== undefined && expected.digest !== digest)) {
        throw new Error("Integration package source digest does not match canonical content");
    }
    if (expected.kind !== undefined && envelope.kind !== expected.kind) {
        throw new Error(`Integration package kind must be ${JSON.stringify(expected.kind)}`);
    }
    if (expected.version !== undefined && envelope.version !== expected.version) {
        throw new Error(`Integration package version must be ${JSON.stringify(expected.version)}`);
    }
    return { envelope, canonicalBytes, digest };
}

export async function writeStagedPackage(
    layout: IntegrationPackageCacheLayout,
    input: PreparedIntegrationPackage,
    limits: Partial<IntegrationPackageLimits> | undefined,
): Promise<string> {
    const staging = await mkdtemp(join(layout.staging, `${input.digest}-`));
    assertWithinCache(layout.staging, staging);
    try {
        const root = join(staging, "root");
        await mkdir(root, { mode: 0o750 });
        const directories = new Set<string>([root]);
        const packageDocument = join(staging, "package.json");
        await writeDurableFile(packageDocument, input.canonicalBytes);
        let filesSinceHeartbeat = 0;
        for (const [path, file] of Object.entries(input.envelope.files).sort(comparePaths)) {
            const destination = join(root, ...path.split("/"));
            assertWithinCache(root, destination);
            await createParentDirectories(root, dirname(destination), directories);
            await writeDurableFile(destination, decodeIntegrationPackageFile(file));
            filesSinceHeartbeat += 1;
            if (filesSinceHeartbeat >= 64) {
                await heartbeat(staging);
                filesSinceHeartbeat = 0;
            }
        }
        await heartbeat(staging);
        for (const directory of [...directories].sort(deepestFirst)) {
            await chmod(directory, 0o550);
            await syncDirectory(directory);
        }
        await chmod(staging, 0o550);
        await syncDirectory(staging);
        await syncDirectory(layout.staging);
        await verifyStagedPackage(layout, staging, input.digest, limits);
        return staging;
    } catch (error) {
        await removeCacheTree(layout, staging);
        throw error;
    }
}

export async function syncDirectory(path: string): Promise<void> {
    const handle = await open(path, constants.O_RDONLY);
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
}

async function writeDurableFile(path: string, bytes: Uint8Array): Promise<void> {
    const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o640);
    try {
        await handle.writeFile(bytes);
        await handle.chmod(0o440);
        await handle.sync();
    } finally {
        await handle.close();
    }
}

async function heartbeat(staging: string): Promise<void> {
    const now = new Date();
    await utimes(staging, now, now);
}

async function createParentDirectories(root: string, directory: string, found: Set<string>): Promise<void> {
    if (directory === root || found.has(directory)) {
        return;
    }
    await createParentDirectories(root, dirname(directory), found);
    await mkdir(directory, { mode: 0o750 });
    found.add(directory);
}

function deepestFirst(left: string, right: string): number {
    return right.split("/").length - left.split("/").length;
}

function comparePaths(left: [string, unknown], right: [string, unknown]): number {
    return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
