import { opendir } from "node:fs/promises";
import { join } from "node:path";
import type {
    FsReleaseReportRecoveryDiagnostic,
    FsReleaseReportRecoveryResult,
} from "../../../../../interfaces/reportStore";
import { removeFileIfExists } from "../../persistence/canonicalFile";
import { ensureFsIntegrationRegistryLayout } from "../../persistence/layout";
import { readVerifiedRegistryDirectory, withVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { quarantineRegistryPath } from "../../recovery/quarantine";
import { readReleaseReportIdentity } from "./document";
import { isReleaseReportTemporaryFile, loadReleaseReportHistory, MAX_RELEASE_REPORT_TEMPORARIES } from "./history";
import {
    MAX_RELEASE_REPORT_HISTORIES_PER_STREAM,
    releaseReportHistoryPaths,
    releaseReportKeyDigest,
    releaseReportStoreRoot,
    verifyReleaseReportHistoryPaths,
} from "./layout";
import {
    fsCompatibilityV2ReportAdapter,
    fsMigrationReportAdapter,
    fsReleaseAdmissionDecisionAdapter,
    fsVerificationReportAdapter,
} from "./stores";
import type { FsReleaseReportHistoryAdapter } from "./types";

export async function recoverFsReleaseReportHistories(root: string): Promise<FsReleaseReportRecoveryResult> {
    const layout = await ensureFsIntegrationRegistryLayout(root);
    const storeRoot = releaseReportStoreRoot(layout.root);
    const diagnostics: FsReleaseReportRecoveryDiagnostic[] = [];
    await recoverStream(storeRoot, fsCompatibilityV2ReportAdapter, layout, diagnostics);
    await recoverStream(storeRoot, fsVerificationReportAdapter, layout, diagnostics);
    await recoverStream(storeRoot, fsMigrationReportAdapter, layout, diagnostics);
    await recoverStream(storeRoot, fsReleaseAdmissionDecisionAdapter, layout, diagnostics);
    return { diagnostics };
}

async function recoverStream<T, K>(
    storeRoot: string,
    adapter: FsReleaseReportHistoryAdapter<T, K>,
    layout: Awaited<ReturnType<typeof ensureFsIntegrationRegistryLayout>>,
    diagnostics: FsReleaseReportRecoveryDiagnostic[],
): Promise<void> {
    const streamRoot = join(storeRoot, adapter.stream);
    let entries: readonly string[];
    try {
        await readVerifiedRegistryDirectory(layout.root);
        await readVerifiedRegistryDirectory(join(layout.root, ".registry"));
        await readVerifiedRegistryDirectory(storeRoot);
        await readVerifiedRegistryDirectory(streamRoot);
        entries = await historyEntries(streamRoot);
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return;
        }
        throw error;
    }
    for (const name of entries) {
        const history = join(streamRoot, name);
        try {
            if (!/^[a-f0-9]{64}$/u.test(name)) {
                throw new Error("Release report history name is not a canonical key digest");
            }
            await readVerifiedRegistryDirectory(history);
            const key = await readReleaseReportIdentity(
                join(history, "identity.json"),
                adapter.stream,
                adapter.parseKey,
            );
            if (!key || (await releaseReportKeyDigest(key)) !== name) {
                throw new Error("Release report history directory does not match its canonical logical-key digest");
            }
            const paths = await releaseReportHistoryPaths(layout.root, adapter.stream, key);
            await verifyReleaseReportHistoryPaths(paths);
            await cleanupReleaseReportTemporaryFiles(history);
            await loadReleaseReportHistory(history, adapter, key);
        } catch (error) {
            const quarantinePath = await quarantineRegistryPath(
                layout,
                "release-report-histories",
                `${adapter.stream}-${name}`,
                history,
            );
            if (!quarantinePath) {
                continue;
            }
            diagnostics.push({
                stream: adapter.stream,
                history: name,
                code: "invalid-history-quarantined",
                message: errorMessage(error),
                quarantinePath,
            });
        }
    }
}

async function cleanupReleaseReportTemporaryFiles(historyRoot: string): Promise<void> {
    const rootFiles = await temporaryFiles(historyRoot, true, 0);
    const revisionsRoot = join(historyRoot, "revisions");
    const revisionFiles = await temporaryFiles(revisionsRoot, false, rootFiles.length);
    await removeTemporaryFiles(historyRoot, rootFiles);
    await removeTemporaryFiles(revisionsRoot, revisionFiles);
}

async function temporaryFiles(path: string, validateHistoryRoot: boolean, existing: number): Promise<string[]> {
    return await withVerifiedRegistryDirectory(path, async (descriptorPath) => {
        const handle = await opendir(descriptorPath);
        const names: string[] = [];
        for await (const entry of handle) {
            if (validateHistoryRoot && (entry.name === "identity.json" || entry.name === "revisions")) {
                continue;
            }
            if (!isReleaseReportTemporaryFile(entry.name)) {
                if (validateHistoryRoot) {
                    throw new Error(`Invalid release report history entry: ${entry.name}`);
                }
                continue;
            }
            if (entry.isSymbolicLink() || !entry.isFile()) {
                throw new Error(`Invalid release report temporary entry: ${entry.name}`);
            }
            names.push(entry.name);
            if (existing + names.length > MAX_RELEASE_REPORT_TEMPORARIES) {
                throw new Error(`Release report history exceeds ${MAX_RELEASE_REPORT_TEMPORARIES} temporary files`);
            }
        }
        return names;
    });
}

async function removeTemporaryFiles(path: string, names: readonly string[]): Promise<void> {
    await withVerifiedRegistryDirectory(path, async (descriptorPath) => {
        for (const name of names) {
            await removeFileIfExists(join(descriptorPath, name));
        }
    });
}

async function historyEntries(streamRoot: string): Promise<readonly string[]> {
    return await withVerifiedRegistryDirectory(streamRoot, async (descriptorPath) => {
        const handle = await opendir(descriptorPath);
        const names: string[] = [];
        for await (const entry of handle) {
            names.push(entry.name);
            if (names.length > MAX_RELEASE_REPORT_HISTORIES_PER_STREAM) {
                throw new Error(`Release report stream exceeds ${MAX_RELEASE_REPORT_HISTORIES_PER_STREAM} histories`);
            }
        }
        return names.sort();
    });
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}

function errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
}
