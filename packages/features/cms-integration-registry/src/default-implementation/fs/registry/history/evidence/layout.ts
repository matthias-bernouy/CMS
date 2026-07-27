import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    ensureVerifiedRegistryChildDirectory,
    ensureVerifiedRegistryMetadataDirectory,
    readVerifiedRegistryDirectory,
} from "../../persistence/ownedDirectory";
import type { FsReleaseReportStream } from "./types";

export const RELEASE_REPORT_HISTORY_DIRECTORY = "release-reports";
export const MAX_RELEASE_REPORT_HISTORIES_PER_STREAM = 4_096;

export type FsReleaseReportHistoryPaths = Readonly<{
    storeRoot: string;
    streamRoot: string;
    historyRoot: string;
    identity: string;
    revisions: string;
}>;

export function releaseReportStoreRoot(registryRoot: string): string {
    return join(registryRoot, ".registry", RELEASE_REPORT_HISTORY_DIRECTORY);
}

export async function releaseReportKeyDigest(key: unknown): Promise<string> {
    return await sha256Hex(canonicalJsonBytes(key));
}

export async function releaseReportHistoryPaths(
    registryRoot: string,
    stream: FsReleaseReportStream,
    key: unknown,
): Promise<FsReleaseReportHistoryPaths> {
    const storeRoot = releaseReportStoreRoot(registryRoot);
    const streamRoot = join(storeRoot, stream);
    const historyRoot = join(streamRoot, await releaseReportKeyDigest(key));
    return {
        storeRoot,
        streamRoot,
        historyRoot,
        identity: join(historyRoot, "identity.json"),
        revisions: join(historyRoot, "revisions"),
    };
}

export async function ensureReleaseReportHistoryPaths(
    registryRoot: string,
    stream: FsReleaseReportStream,
    key: unknown,
): Promise<FsReleaseReportHistoryPaths> {
    await readVerifiedRegistryDirectory(registryRoot);
    const metadata = await ensureVerifiedRegistryMetadataDirectory(registryRoot);
    const storeRoot = await ensureVerifiedRegistryChildDirectory(metadata, RELEASE_REPORT_HISTORY_DIRECTORY);
    const streamRoot = await ensureVerifiedRegistryChildDirectory(storeRoot, stream);
    const historyRoot = await ensureVerifiedRegistryChildDirectory(streamRoot, await releaseReportKeyDigest(key));
    const revisions = await ensureVerifiedRegistryChildDirectory(historyRoot, "revisions");
    return { storeRoot, streamRoot, historyRoot, identity: join(historyRoot, "identity.json"), revisions };
}

export async function verifyReleaseReportHistoryPaths(paths: FsReleaseReportHistoryPaths): Promise<void> {
    const metadataRoot = join(paths.storeRoot, "..");
    const registryRoot = join(metadataRoot, "..");
    await readVerifiedRegistryDirectory(registryRoot);
    await readVerifiedRegistryDirectory(metadataRoot);
    await readVerifiedRegistryDirectory(paths.storeRoot);
    await readVerifiedRegistryDirectory(paths.streamRoot);
    await readVerifiedRegistryDirectory(paths.historyRoot);
    await readVerifiedRegistryDirectory(paths.revisions);
}

export async function assertReleaseReportHistoryCapacity(
    registryRoot: string,
    stream: FsReleaseReportStream,
    key: unknown,
    maximum = MAX_RELEASE_REPORT_HISTORIES_PER_STREAM,
): Promise<void> {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_RELEASE_REPORT_HISTORIES_PER_STREAM) {
        throw new TypeError("Release report history capacity is invalid");
    }
    const paths = await releaseReportHistoryPaths(registryRoot, stream, key);
    let count = 0;
    try {
        await readVerifiedRegistryDirectory(registryRoot);
        await readVerifiedRegistryDirectory(join(registryRoot, ".registry"));
        await readVerifiedRegistryDirectory(paths.storeRoot);
        await readVerifiedRegistryDirectory(paths.streamRoot);
        const handle = await opendir(paths.streamRoot);
        for await (const entry of handle) {
            if (entry.name === paths.historyRoot.slice(paths.streamRoot.length + 1)) {
                return;
            }
            count += 1;
            if (count >= maximum) {
                throw new Error(`Release report ${stream} store already contains ${maximum} histories`);
            }
        }
    } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") {
            throw error;
        }
    }
}

export function releaseReportRevisionFilename(ordinal: number): string {
    if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 9_999_999_999) {
        throw new TypeError("Release report revision ordinal is invalid");
    }
    return `${ordinal.toString().padStart(10, "0")}.json`;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
