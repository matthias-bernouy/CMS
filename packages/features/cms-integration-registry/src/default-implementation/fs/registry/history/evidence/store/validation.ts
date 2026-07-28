import {
    ReleaseReportConflictError,
    ReleaseReportValidationError,
} from "../../../../../../core/compatibility/reportStoreErrors";
import type { AppendReleaseReportRequest, ReleaseReportHistory } from "../../../../../../interfaces/reportStore";
import { MAX_RELEASE_REPORT_REVISIONS } from "../history";
import { MAX_RELEASE_REPORT_HISTORIES_PER_STREAM } from "../layout";
import type { FsReleaseReportHistoryAdapter } from "../types";
import type { FsReleaseReportHistoryStoreConfig } from ".";

export function releaseReportLimits(config: FsReleaseReportHistoryStoreConfig): {
    historiesPerStream: number;
    revisionsPerHistory: number;
} {
    return {
        historiesPerStream: boundedLimit(
            config.limits?.historiesPerStream,
            MAX_RELEASE_REPORT_HISTORIES_PER_STREAM,
            "release report histories per stream",
        ),
        revisionsPerHistory: boundedLimit(
            config.limits?.revisionsPerHistory,
            MAX_RELEASE_REPORT_REVISIONS,
            "release report revisions per history",
        ),
    };
}

export function assertExpectedCurrent<T, K>(
    history: ReleaseReportHistory<T> | null,
    expected: AppendReleaseReportRequest<T>["expectedCurrent"],
    stream: FsReleaseReportHistoryAdapter<T, K>["stream"],
): void {
    const current = history
        ? { revisionId: history.currentRevisionId, reportDigest: history.currentReportDigest }
        : null;
    if (
        current?.revisionId !== expected?.revisionId ||
        current?.reportDigest !== expected?.reportDigest ||
        (current === null) !== (expected === null)
    ) {
        throw conflict(stream, "expected current revision does not match the stored revision and digest");
    }
}

export function assertAppendShape<T, K>(
    history: ReleaseReportHistory<T> | null,
    report: T,
    adapter: FsReleaseReportHistoryAdapter<T, K>,
): void {
    const fields = adapter.historyFields(report);
    if (!history && (fields.revisionType !== "root" || fields.supersedes !== undefined)) {
        throw new ReleaseReportValidationError(`First release report ${adapter.stream} revision must be a root`);
    }
    if (history) {
        try {
            adapter.assertFollows(history.current, report);
        } catch (error) {
            throw new ReleaseReportValidationError(
                `Release report ${adapter.stream} revision must supersede the exact current report`,
                { cause: error },
            );
        }
    }
}

export function conflict(stream: string, reason: string): ReleaseReportConflictError {
    return new ReleaseReportConflictError(`Release report ${stream} ${reason}`);
}

function boundedLimit(value: number | undefined, maximum: number, label: string): number {
    const limit = value ?? maximum;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
        throw new TypeError(`${label} limit must be between 1 and ${maximum}`);
    }
    return limit;
}
