import type {
    RepositoryActionErrorDetails,
    RepositoryCompatibilityBaselineView,
    RepositoryCompatibilityFindingView,
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
        root: parseRepositoryCompatibilityReport(object.root, "root"),
        current: parseRepositoryCompatibilityReport(object.current),
        currentRevisionId: readText(object.currentRevisionId),
        currentReportDigest: readText(object.currentReportDigest),
        revisions: readArray(object.revisions, 100).map((report) =>
            parseRepositoryCompatibilityReport(report, "revision"),
        ),
        totalRevisions: readCount(object.totalRevisions),
        ...optionalProperty("nextCursor", readOptionalText(object.nextCursor)),
    };
}

export function parseRepositoryCompatibilityReport(
    value: unknown,
    expectedType?: "root" | "revision",
): RepositoryCompatibilityReportView {
    const object = readRecord(value);
    const revisionType = object.revisionType;
    if ((revisionType !== "root" && revisionType !== "revision") || (expectedType && revisionType !== expectedType)) {
        throw new RepositoryUiContractError();
    }
    const evaluator = readRecord(object.evaluator);
    const supersedes = revisionType === "revision" ? readText(object.supersedes) : undefined;
    return {
        reportId: readText(object.reportId),
        revisionType,
        origin: readOrigin(object.origin),
        kind: readText(object.kind),
        version: readText(object.version),
        packageDigest: readText(object.packageDigest),
        outcome: readText(object.outcome),
        contractAdmissible: readBoolean(object.contractAdmissible),
        evaluator: { name: readText(evaluator.name), version: readText(evaluator.version) },
        createdAt: readText(object.createdAt),
        releaseLevel: readText(object.releaseLevel),
        requiredReleaseLevel: readText(object.requiredReleaseLevel),
        baselines: readArray(object.baselines, 16).map(parseBaseline),
        informationalBaselines: readArray(object.informationalBaselines, 16).map(parseBaseline),
        findings: readArray(object.findings, 4_096).map(parseFinding),
        ...optionalProperty("noBaselineReason", readOptionalText(object.noBaselineReason)),
        ...(supersedes ? { supersedes } : {}),
        provenance: parseProvenance(object.provenance),
    };
}

export function parseRepositoryReevaluationResult(value: unknown): RepositoryReevaluationResultView {
    const object = readRecord(value);
    const release = object.release === undefined ? undefined : readReevaluationRelease(object.release);
    return {
        revision: parseRepositoryCompatibilityReport(object.revision, "revision"),
        currentReport: readCurrentReport(object.currentReport),
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

function parseFinding(value: unknown): RepositoryCompatibilityFindingView {
    const object = readRecord(value);
    return {
        findingId: readText(object.findingId),
        classification: readText(object.classification),
        surface: readText(object.surface),
        code: readText(object.code),
        message: readText(object.message),
    };
}

function readCurrentReport(value: unknown): RepositoryReevaluationResultView["currentReport"] {
    const object = readRecord(value);
    return { revisionId: readText(object.revisionId), reportDigest: readText(object.reportDigest) };
}

function readOrigin(value: unknown): RepositoryCompatibilityReportView["origin"] {
    if (value !== "admission" && value !== "legacy-backfill") {
        throw new RepositoryUiContractError();
    }
    return value;
}

function parseProvenance(value: unknown): NonNullable<RepositoryCompatibilityReportView["provenance"]> {
    const object = readRecord(value);
    return {
        reason: readText(object.reason),
        evidenceIds: readArray(object.evidenceIds ?? [], 256).map(readText),
    };
}
