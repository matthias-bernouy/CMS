import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { ReleaseReportIntegrityError } from "../../../../../core/compatibility/reportStoreErrors";
import type { ReleaseReportHistory } from "../../../../../interfaces/reportStore";
import { withVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { removeFileIfExists } from "../../persistence/canonicalFile";
import {
    readReleaseReportIdentity,
    readReleaseReportRevision,
    sameReleaseReportKey,
    writeReleaseReportIdentity,
} from "./document";
import { releaseReportRevisionFilename } from "./layout";
import type { FsReleaseReportHistoryAdapter, FsReleaseReportRevisionDocument } from "./types";

export const MAX_RELEASE_REPORT_REVISIONS = 4_096;
const MAX_RELEASE_REPORT_TEMPORARIES = 64;
const CANONICAL_TEMPORARY_FILE = /^\.[0-9a-f-]{36}\.tmp$/u;

export async function ensureReleaseReportIdentity<T, K>(
    path: string,
    key: K,
    adapter: FsReleaseReportHistoryAdapter<T, K>,
): Promise<void> {
    try {
        await writeReleaseReportIdentity(path, adapter.stream, key);
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
    }
    const stored = await readReleaseReportIdentity(path, adapter.stream, adapter.parseKey);
    if (!stored || !sameReleaseReportKey(stored, key)) {
        throw new ReleaseReportIntegrityError(`Release report ${adapter.stream} logical-key digest collision`);
    }
}

export async function loadReleaseReportHistory<T, K>(
    historyRoot: string,
    adapter: FsReleaseReportHistoryAdapter<T, K>,
    expectedKey?: K,
    allowEmpty = false,
): Promise<ReleaseReportHistory<T> | null> {
    const identity = await readReleaseReportIdentity(
        join(historyRoot, "identity.json"),
        adapter.stream,
        adapter.parseKey,
    );
    if (!identity || (expectedKey && !sameReleaseReportKey(identity, expectedKey))) {
        throw new ReleaseReportIntegrityError(`Release report ${adapter.stream} identity is missing or inconsistent`);
    }
    const documents = await readRevisionDocuments(join(historyRoot, "revisions"), adapter);
    if (documents.length === 0) {
        if (allowEmpty) {
            return null;
        }
        throw new ReleaseReportIntegrityError(`Release report ${adapter.stream} history has no root revision`);
    }
    validateHistory(identity, documents, adapter);
    const revisions = documents.map(({ report }) => report);
    const currentDocument = documents.at(-1)!;
    return {
        currentRevisionId: adapter.revisionId(currentDocument.report),
        currentReportDigest: currentDocument.reportDigest,
        current: currentDocument.report,
        revisions,
    };
}

function validateHistory<T, K>(
    identity: K,
    documents: readonly FsReleaseReportRevisionDocument<T>[],
    adapter: FsReleaseReportHistoryAdapter<T, K>,
): void {
    const revisionIds = new Set<string>();
    for (let index = 0; index < documents.length; index += 1) {
        const document = documents[index]!;
        if (document.ordinal !== index + 1) {
            throw new ReleaseReportIntegrityError(`Release report ${adapter.stream} ordinals are not contiguous`);
        }
        if (!sameReleaseReportKey(adapter.key(document.report), identity)) {
            throw new ReleaseReportIntegrityError(`Release report ${adapter.stream} changed its logical key`);
        }
        const revisionId = adapter.revisionId(document.report);
        if (revisionIds.has(revisionId)) {
            throw new ReleaseReportIntegrityError(`Release report ${adapter.stream} revision IDs are not unique`);
        }
        revisionIds.add(revisionId);
        const fields = adapter.historyFields(document.report);
        if (index === 0 && (fields.revisionType !== "root" || fields.supersedes !== undefined)) {
            throw new ReleaseReportIntegrityError(`Release report ${adapter.stream} history must start with a root`);
        }
        if (index > 0) {
            try {
                adapter.assertFollows(documents[index - 1]!.report, document.report);
            } catch (error) {
                throw new ReleaseReportIntegrityError(
                    `Release report ${adapter.stream} history is branched, reordered, or changes identity`,
                    { cause: error },
                );
            }
        }
    }
}

async function readRevisionDocuments<T, K>(
    revisionsRoot: string,
    adapter: FsReleaseReportHistoryAdapter<T, K>,
): Promise<readonly FsReleaseReportRevisionDocument<T>[]> {
    return await withVerifiedRegistryDirectory(revisionsRoot, async (descriptorPath) => {
        const handle = await opendir(descriptorPath);
        const documents: FsReleaseReportRevisionDocument<T>[] = [];
        let temporaryCount = 0;
        for await (const entry of handle) {
            if (entry.isFile() && CANONICAL_TEMPORARY_FILE.test(entry.name)) {
                temporaryCount += 1;
                if (temporaryCount > MAX_RELEASE_REPORT_TEMPORARIES) {
                    throw new ReleaseReportIntegrityError(
                        `Release report ${adapter.stream} history exceeds ${MAX_RELEASE_REPORT_TEMPORARIES} temporary files`,
                    );
                }
                continue;
            }
            if (entry.isSymbolicLink() || !entry.isFile() || !/^\d{10}\.json$/u.test(entry.name)) {
                throw new ReleaseReportIntegrityError(`Invalid release report revision entry: ${entry.name}`);
            }
            const document = await readReleaseReportRevision(join(descriptorPath, entry.name), adapter);
            if (!document || releaseReportRevisionFilename(document.ordinal) !== entry.name) {
                throw new ReleaseReportIntegrityError(
                    `Release report revision filename has the wrong ordinal: ${entry.name}`,
                );
            }
            documents.push(document);
            if (documents.length > MAX_RELEASE_REPORT_REVISIONS) {
                throw new ReleaseReportIntegrityError(
                    `Release report ${adapter.stream} history exceeds ${MAX_RELEASE_REPORT_REVISIONS} revisions`,
                );
            }
        }
        return documents.sort((left, right) => left.ordinal - right.ordinal);
    });
}

export async function cleanupReleaseReportTemporaryFiles(historyRoot: string): Promise<number> {
    const revisionsRoot = join(historyRoot, "revisions");
    return await withVerifiedRegistryDirectory(revisionsRoot, async (descriptorPath) => {
        const handle = await opendir(descriptorPath);
        const temporaryFiles: string[] = [];
        for await (const entry of handle) {
            if (entry.isFile() && !entry.isSymbolicLink() && CANONICAL_TEMPORARY_FILE.test(entry.name)) {
                temporaryFiles.push(entry.name);
                if (temporaryFiles.length > MAX_RELEASE_REPORT_TEMPORARIES) {
                    throw new ReleaseReportIntegrityError(
                        `Release report history exceeds ${MAX_RELEASE_REPORT_TEMPORARIES} temporary files`,
                    );
                }
            }
        }
        for (const name of temporaryFiles) {
            await removeFileIfExists(join(revisionsRoot, name));
        }
        return temporaryFiles.length;
    });
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
