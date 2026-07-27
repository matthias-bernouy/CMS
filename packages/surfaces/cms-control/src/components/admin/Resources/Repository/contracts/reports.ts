import type {
    RepositoryActionErrorDetails,
    RepositoryCompatibilityBaselineView,
    RepositoryCompatibilityEvidenceView,
    RepositoryCompatibilityPageView,
    RepositoryCompatibilityReportView,
    RepositoryPromotionResultView,
    RepositoryReevaluationResultView,
    RepositoryVersionBlockResultView,
} from "./types";
import {
    optionalProperty,
    readArray,
    readBoolean,
    readCount,
    readOptionalText,
    readRecord,
    readText,
    RepositoryUiContractError,
} from "./parsing";

export function parseRepositoryCompatibilityPage(value: unknown): RepositoryCompatibilityPageView {
    const object = readRecord(value);
    return {
        admission: parseRepositoryCompatibilityReport(object.admission, "admission"),
        current: parseRepositoryCompatibilityReport(object.current),
        revisions: readArray(object.revisions, 100).map((report) =>
            parseRepositoryCompatibilityReport(report, "revision"),
        ),
        totalRevisions: readCount(object.totalRevisions),
        ...optionalProperty("nextCursor", readOptionalText(object.nextCursor)),
    };
}

export function parseRepositoryCompatibilityReport(
    value: unknown,
    expectedType?: "admission" | "revision",
): RepositoryCompatibilityReportView {
    const object = readRecord(value);
    const reportType = object.reportType;
    if ((reportType !== "admission" && reportType !== "revision") || (expectedType && reportType !== expectedType)) {
        throw new RepositoryUiContractError();
    }
    const evaluator = readRecord(object.evaluator);
    const supersedes = reportType === "revision" ? readText(object.supersedes) : undefined;
    const provenance = reportType === "revision" ? parseProvenance(object.provenance) : undefined;
    return {
        id: readText(object.id),
        reportType,
        kind: readText(object.kind),
        version: readText(object.version),
        packageDigest: readText(object.packageDigest),
        outcome: readText(object.outcome),
        admissible: readBoolean(object.admissible),
        evaluator: { name: readText(evaluator.name), version: readText(evaluator.version) },
        createdAt: readText(object.createdAt),
        releaseLevel: readText(object.releaseLevel),
        requiredReleaseLevel: readText(object.requiredReleaseLevel),
        baselines: readArray(object.baselines, 16).map(parseBaseline),
        informationalBaselines: readArray(object.informationalBaselines, 16).map(parseBaseline),
        evidence: readArray(object.evidence, 4_096).map(parseEvidence),
        ...optionalProperty("noBaselineReason", readOptionalText(object.noBaselineReason)),
        ...(supersedes ? { supersedes } : {}),
        ...(provenance ? { provenance } : {}),
    };
}

export function parseRepositoryReevaluationResult(value: unknown): RepositoryReevaluationResultView {
    const object = readRecord(value);
    const release = object.release === undefined ? undefined : readReevaluationRelease(object.release);
    return {
        revision: parseRepositoryCompatibilityReport(object.revision, "revision"),
        currentReportRevisionId: readText(object.currentReportRevisionId),
        ...(release ? { release } : {}),
    };
}

function readReevaluationRelease(value: unknown): NonNullable<RepositoryReevaluationResultView["release"]> {
    const object = readRecord(value);
    const decision = readRecord(object.decision);
    return {
        compatibilityReportRevisionId: readText(object.compatibilityReportRevisionId),
        decision: {
            revisionId: readText(decision.revisionId),
            digest: readText(decision.digest),
        },
        admissible: readBoolean(object.admissible),
        eligibilityChanged: readBoolean(object.eligibilityChanged),
    };
}

export function parseRepositoryPromotionResult(value: unknown): RepositoryPromotionResultView {
    const object = readRecord(value);
    const record = readRecord(object.record);
    return {
        operationId: readText(object.operationId),
        kind: readText(record.kind),
        version: readText(record.version),
        reportRevisionId: readText(record.reportRevisionId),
        ...optionalProperty("previousStable", readOptionalText(record.previousStable)),
    };
}

export function parseRepositoryVersionBlockResult(value: unknown): RepositoryVersionBlockResultView {
    const object = readRecord(value);
    const record = readRecord(object.record);
    const channels = readRecord(record.nextChannels);
    return {
        operationId: readText(object.operationId),
        kind: readText(record.kind),
        version: readText(record.version),
        nextChannels: {
            ...optionalProperty("stable", readOptionalText(channels.stable)),
            ...optionalProperty("latest", readOptionalText(channels.latest)),
        },
    };
}

export function parseRepositoryActionErrorDetails(value: unknown): RepositoryActionErrorDetails {
    const object = readRecord(value);
    const report = object.report === undefined ? undefined : parseRepositoryCompatibilityReport(object.report);
    return {
        ...optionalProperty("currentReportRevisionId", readOptionalText(object.currentReportRevisionId)),
        ...optionalProperty("existingDigest", readOptionalText(object.existingDigest)),
        ...optionalProperty("latest", readOptionalText(object.latest)),
        ...optionalProperty("reportRevisionId", readOptionalText(object.reportRevisionId)),
        ...(report ? { report } : {}),
    };
}

function parseBaseline(value: unknown): RepositoryCompatibilityBaselineView {
    const object = readRecord(value);
    return {
        kind: readText(object.kind),
        version: readText(object.version),
        packageDigest: readText(object.packageDigest),
    };
}

function parseEvidence(value: unknown): RepositoryCompatibilityEvidenceView {
    const object = readRecord(value);
    return {
        classification: readText(object.classification),
        surface: readText(object.surface),
        code: readText(object.code),
        message: readText(object.message),
    };
}

function parseProvenance(value: unknown): NonNullable<RepositoryCompatibilityReportView["provenance"]> {
    const object = readRecord(value);
    return {
        reason: readText(object.reason),
        evidenceIds: readArray(object.evidenceIds ?? [], 256).map(readText),
    };
}
