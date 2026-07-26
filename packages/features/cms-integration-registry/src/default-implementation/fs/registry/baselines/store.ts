import { join } from "node:path";
import { assertReportRevisionFollows, identifyReviewedSchemaBaseline } from "@bernouy/cms-integration-verification";
import {
    ReviewedSchemaBaselineConflictError,
    ReviewedSchemaBaselineValidationError,
} from "../../../../core/compatibility/reportStoreErrors";
import type {
    AppendReviewedSchemaBaselineRequest,
    ReviewedSchemaBaselineHistory,
    ReviewedSchemaBaselineLogicalKey,
    ReviewedSchemaBaselineStore,
} from "../../../../interfaces/reportStore";
import { reviewedSchemaBaselineLogicalKey, writeReviewedSchemaBaselineRevision } from "./document";
import {
    ensureReviewedSchemaBaselineIdentity,
    loadReviewedSchemaBaselineHistory,
    requireReviewedSchemaBaselineHistory,
} from "./history";
import { listReviewedSchemaBaselineHistories, listReviewedSchemaBaselinesForPackage } from "./inventory";
import {
    ensureReviewedSchemaBaselinePaths,
    reviewedSchemaBaselinePaths,
    reviewedSchemaBaselineRevisionFilename,
} from "./layout";

export type FsReviewedSchemaBaselineStoreConfig = Readonly<{ root: string }>;

export class FsReviewedSchemaBaselineStore implements ReviewedSchemaBaselineStore {
    constructor(private readonly config: FsReviewedSchemaBaselineStoreConfig) {}

    async get(logicalKey: ReviewedSchemaBaselineLogicalKey): Promise<ReviewedSchemaBaselineHistory | null> {
        const paths = await reviewedSchemaBaselinePaths(this.config.root, logicalKey);
        try {
            return await loadReviewedSchemaBaselineHistory(paths.history, logicalKey);
        } catch (error) {
            if (isNodeError(error) && error.code === "ENOENT") {
                return null;
            }
            throw error;
        }
    }

    async listForPackage(
        kind: string,
        version: string,
        packageDigest: string,
    ): Promise<readonly ReviewedSchemaBaselineHistory[]> {
        return await listReviewedSchemaBaselinesForPackage(this.config.root, kind, version, packageDigest);
    }

    async listAll(): Promise<readonly ReviewedSchemaBaselineHistory[]> {
        return await listReviewedSchemaBaselineHistories(this.config.root);
    }

    async append(request: AppendReviewedSchemaBaselineRequest): Promise<ReviewedSchemaBaselineHistory> {
        let identified: Awaited<ReturnType<typeof identifyReviewedSchemaBaseline>>;
        try {
            identified = await identifyReviewedSchemaBaseline(request.baseline);
        } catch (error) {
            throw new ReviewedSchemaBaselineValidationError("Reviewed schema baseline is invalid", { cause: error });
        }
        const logicalKey = reviewedSchemaBaselineLogicalKey(identified.baseline);
        const paths = await ensureReviewedSchemaBaselinePaths(this.config.root, logicalKey);
        await ensureReviewedSchemaBaselineIdentity(paths.identity, logicalKey);
        const before = await loadReviewedSchemaBaselineHistory(paths.history, logicalKey, true);
        const existing = before?.revisions.find((revision) => revision.reportId === identified.baseline.reportId);
        if (existing) {
            const existingIdentity = await identifyReviewedSchemaBaseline(existing);
            if (existingIdentity.digest !== identified.digest) {
                throw new ReviewedSchemaBaselineConflictError(
                    `Reviewed schema baseline revision "${identified.baseline.reportId}" already has different content`,
                );
            }
            return before!;
        }
        assertAppendShape(before, request, identified.baseline);
        const ordinal = (before?.revisions.length ?? 0) + 1;
        const path = join(paths.revisions, reviewedSchemaBaselineRevisionFilename(ordinal));
        try {
            await writeReviewedSchemaBaselineRevision(path, ordinal, identified.baseline);
        } catch (error) {
            if (!isNodeError(error) || error.code !== "EEXIST") {
                throw error;
            }
        }
        const after = requireReviewedSchemaBaselineHistory(
            await loadReviewedSchemaBaselineHistory(paths.history, logicalKey),
        );
        const committed = after.revisions.find((revision) => revision.reportId === identified.baseline.reportId);
        if (!committed) {
            throw new ReviewedSchemaBaselineConflictError(
                `Reviewed schema baseline changed concurrently from revision "${request.expectedCurrentRevisionId ?? "root"}"`,
            );
        }
        const committedIdentity = await identifyReviewedSchemaBaseline(committed);
        if (committedIdentity.digest !== identified.digest) {
            throw new ReviewedSchemaBaselineConflictError(
                `Reviewed schema baseline revision "${identified.baseline.reportId}" lost a concurrent CAS`,
            );
        }
        return after;
    }
}

function assertAppendShape(
    before: ReviewedSchemaBaselineHistory | null,
    request: AppendReviewedSchemaBaselineRequest,
    baseline: AppendReviewedSchemaBaselineRequest["baseline"],
): void {
    const currentRevisionId = before?.currentRevisionId ?? null;
    if (request.expectedCurrentRevisionId !== currentRevisionId) {
        throw new ReviewedSchemaBaselineConflictError(
            `Reviewed schema baseline expected current revision "${request.expectedCurrentRevisionId ?? "root"}" but found "${currentRevisionId ?? "root"}"`,
        );
    }
    if (!before && baseline.revisionType !== "root") {
        throw new ReviewedSchemaBaselineValidationError("First reviewed schema baseline revision must be a root");
    }
    if (before && (baseline.revisionType !== "revision" || baseline.supersedes !== before.currentRevisionId)) {
        throw new ReviewedSchemaBaselineValidationError(
            `Reviewed schema baseline revision must supersede "${before.currentRevisionId}"`,
        );
    }
    if (before) {
        try {
            assertReportRevisionFollows(before.current, baseline);
        } catch (error) {
            throw new ReviewedSchemaBaselineValidationError("Reviewed schema baseline revision history is invalid", {
                cause: error,
            });
        }
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
