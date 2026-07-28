import { ReviewedSchemaBaselineImportError } from "../../../../../../core/baselines/errors";
import { ReviewedSchemaBaselineConflictError } from "../../../../../../core/compatibility/reportStoreErrors";
import type {
    ReviewedSchemaBaselineHistory,
    ReviewedSchemaBaselineImportRequest,
    ReviewedSchemaBaselineImportResult,
} from "../../../../../../interfaces/reportStore";
import { removeFileIfExists } from "../../../persistence/canonicalFile";
import {
    createReviewedSchemaBaselineImportJournal,
    REVIEWED_SCHEMA_BASELINE_IMPORT_JOURNAL_SCHEMA,
    type FsReviewedSchemaBaselineImportJournal,
    writeReviewedSchemaBaselineImportJournal,
} from "../document";
import { ensureReviewedSchemaBaselineImportStorage, reviewedSchemaBaselineImportJournalPath } from "../layout";
import type { FsReviewedSchemaBaselineImportBoundary, FsReviewedSchemaBaselineImporterConfig } from "../types";
import { FsReviewedSchemaBaselineImportSimulatedCrashError } from "../types";
import {
    assertReviewedSchemaBaselineImportCas,
    exactBaselineAlreadyStored,
    validateReviewedSchemaBaselineImport,
} from "../validation";

export async function validateAndAppendReviewedSchemaBaselineImport(
    input: Readonly<{
        config: FsReviewedSchemaBaselineImporterConfig;
        operationId: string;
        request: ReviewedSchemaBaselineImportRequest;
        requestDigest: string;
        policyDigest: string;
        journal: boolean;
    }>,
): Promise<Readonly<{ result: ReviewedSchemaBaselineImportResult; history: ReviewedSchemaBaselineHistory }>> {
    const { baseline } = input.request;
    await validateReviewedSchemaBaselineImport(
        input.request,
        input.config.snapshots.current(),
        input.config.approval,
        input.config.approvedTargets,
    );
    const logicalKey = {
        kind: baseline.kind,
        version: baseline.version,
        packageDigest: baseline.packageDigest,
        connectorKey: baseline.connectorKey,
        lineageId: baseline.lineageId,
    };
    const before = await input.config.store.get(logicalKey);
    if (await exactBaselineAlreadyStored(before, input.request)) {
        return { result: importResult(input.operationId, "unchanged", input.request, before!), history: before! };
    }
    assertReviewedSchemaBaselineImportCas(before, input.request);
    if (!input.journal) {
        const history = await appendBaseline(input.config, input.request);
        return { result: importResult(input.operationId, "imported", input.request, history), history };
    }
    return await commitJournaledImport(input, logicalKey);
}

async function commitJournaledImport(
    input: Parameters<typeof validateAndAppendReviewedSchemaBaselineImport>[0],
    logicalKey: Parameters<FsReviewedSchemaBaselineImporterConfig["store"]["get"]>[0],
) {
    const storage = await ensureReviewedSchemaBaselineImportStorage(input.config.root);
    const path = reviewedSchemaBaselineImportJournalPath(storage, input.operationId);
    let journal: FsReviewedSchemaBaselineImportJournal = {
        schema: REVIEWED_SCHEMA_BASELINE_IMPORT_JOURNAL_SCHEMA,
        operationId: input.operationId,
        phase: "prepared",
        createdAt: input.config.now?.() ?? new Date().toISOString(),
        policyDigest: input.policyDigest,
        requestDigest: input.requestDigest,
        request: input.request,
    };
    await createReviewedSchemaBaselineImportJournal(path, journal);
    await notifyBoundary(input.config, journal);
    let history: ReviewedSchemaBaselineHistory;
    try {
        history = await appendBaseline(input.config, input.request);
        journal = { ...journal, phase: "baseline-written" };
        await writeReviewedSchemaBaselineImportJournal(path, journal);
        await notifyBoundary(input.config, journal);
        await removeFileIfExists(path);
    } catch (error) {
        if (error instanceof FsReviewedSchemaBaselineImportSimulatedCrashError) {
            throw error;
        }
        const committed = await input.config.store.get(logicalKey).catch(() => null);
        if (await exactBaselineAlreadyStored(committed, input.request)) {
            throw new ReviewedSchemaBaselineImportError(
                503,
                "reviewed_schema_baseline_import_recovery_required",
                "Reviewed schema baseline import committed but requires journal recovery",
                { cause: error },
            );
        }
        await removeFileIfExists(path);
        throw error;
    }
    return { result: importResult(input.operationId, "imported", input.request, history), history };
}

async function appendBaseline(
    config: FsReviewedSchemaBaselineImporterConfig,
    request: ReviewedSchemaBaselineImportRequest,
) {
    try {
        return await config.store.append({
            baseline: request.baseline,
            expectedCurrentRevisionId: request.expectedCurrent?.revisionId ?? null,
        });
    } catch (error) {
        if (error instanceof ReviewedSchemaBaselineConflictError) {
            throw new ReviewedSchemaBaselineImportError(
                409,
                "reviewed_schema_baseline_import_conflict",
                "Reviewed schema baseline import lost its current-revision CAS",
                { cause: error },
            );
        }
        throw error;
    }
}

async function notifyBoundary(
    config: FsReviewedSchemaBaselineImporterConfig,
    journal: FsReviewedSchemaBaselineImportJournal,
) {
    const boundary = importBoundary(journal);
    try {
        await config.afterBoundary?.(boundary);
    } catch (error) {
        throw new FsReviewedSchemaBaselineImportSimulatedCrashError(boundary, error);
    }
}

function importBoundary(journal: FsReviewedSchemaBaselineImportJournal): FsReviewedSchemaBaselineImportBoundary {
    return {
        operationId: journal.operationId,
        phase: journal.phase,
        kind: journal.request.baseline.kind,
        version: journal.request.baseline.version,
        packageDigest: journal.request.baseline.packageDigest,
        baselineDigest: journal.request.baselineDigest,
    };
}

function importResult(
    operationId: string,
    outcome: "imported" | "unchanged",
    request: ReviewedSchemaBaselineImportRequest,
    history: ReviewedSchemaBaselineHistory,
): ReviewedSchemaBaselineImportResult {
    return Object.freeze({
        operationId,
        outcome,
        kind: request.baseline.kind,
        version: request.baseline.version,
        packageDigest: request.baseline.packageDigest,
        baselineDigest: request.baselineDigest,
        currentRevisionId: history.currentRevisionId,
    });
}
