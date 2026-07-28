import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { ReleaseReportIntegrityError } from "../../../../../core/compatibility/reportStoreErrors";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../../persistence/canonicalFile";
import type { FsReleaseReportHistoryAdapter, FsReleaseReportRevisionDocument, FsReleaseReportStream } from "./types";

const IDENTITY_SCHEMA = "cms.integration.registry.release-report-identity.v1";
const REVISION_SCHEMA = "cms.integration.registry.release-report-revision.v1";
const MAX_IDENTITY_BYTES = 16 * 1_024;
const MAX_REPORT_REVISION_BYTES = 16 * 1_024 * 1_024;

export async function readReleaseReportIdentity<K>(
    path: string,
    stream: FsReleaseReportStream,
    parseKey: (value: unknown) => K,
): Promise<K | null> {
    const value = await readCanonicalJsonFile(path, MAX_IDENTITY_BYTES);
    if (value === null) {
        return null;
    }
    if (
        !hasExactKeys(value, ["key", "schema", "stream"]) ||
        value.schema !== IDENTITY_SCHEMA ||
        value.stream !== stream
    ) {
        throw integrity(`Invalid release report identity document: ${path}`);
    }
    try {
        return parseKey(value.key);
    } catch (error) {
        throw integrity(`Invalid release report logical key: ${path}`, error);
    }
}

export async function writeReleaseReportIdentity<K>(
    path: string,
    stream: FsReleaseReportStream,
    key: K,
): Promise<void> {
    await writeCanonicalJsonNoReplace(path, { schema: IDENTITY_SCHEMA, stream, key }, MAX_IDENTITY_BYTES);
}

export async function readReleaseReportRevision<T, K>(
    path: string,
    adapter: FsReleaseReportHistoryAdapter<T, K>,
): Promise<FsReleaseReportRevisionDocument<T> | null> {
    const value = await readCanonicalJsonFile(path, MAX_REPORT_REVISION_BYTES);
    if (value === null) {
        return null;
    }
    if (
        !hasExactKeys(value, ["ordinal", "report", "reportDigest", "schema", "stream"]) ||
        value.schema !== REVISION_SCHEMA ||
        value.stream !== adapter.stream ||
        !Number.isSafeInteger(value.ordinal) ||
        (value.ordinal as number) < 1 ||
        typeof value.reportDigest !== "string"
    ) {
        throw integrity(`Invalid release report revision document: ${path}`);
    }
    let identified: Awaited<ReturnType<typeof adapter.identify>>;
    try {
        identified = await adapter.identify(value.report);
    } catch (error) {
        throw integrity(`Invalid release report content: ${path}`, error);
    }
    if (identified.digest !== value.reportDigest) {
        throw integrity(`Release report revision digest does not match its content: ${path}`);
    }
    return { ordinal: value.ordinal as number, reportDigest: identified.digest, report: identified.report };
}

export async function writeReleaseReportRevision<T, K>(
    path: string,
    ordinal: number,
    report: T,
    adapter: FsReleaseReportHistoryAdapter<T, K>,
): Promise<string> {
    const identified = await adapter.identify(report);
    await writeCanonicalJsonNoReplace(
        path,
        {
            schema: REVISION_SCHEMA,
            stream: adapter.stream,
            ordinal,
            reportDigest: identified.digest,
            report: identified.report,
        },
        MAX_REPORT_REVISION_BYTES,
    );
    return identified.digest;
}

export function sameReleaseReportKey(left: unknown, right: unknown): boolean {
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => key in value);
}

function integrity(message: string, cause?: unknown): ReleaseReportIntegrityError {
    return new ReleaseReportIntegrityError(message, cause === undefined ? undefined : { cause });
}
