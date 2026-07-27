import {
    array,
    canonicalText,
    digest,
    enumValue,
    exactObject,
    isoTimestamp,
    nonNegativeInteger,
    packageKind,
    packageVersion,
} from "./helpers";

const OPERATIONS = ["stable-promotion", "compatibility-reevaluation"] as const;
const OPERATION_OUTCOMES = ["succeeded", "rejected", "failed"] as const;
const COMPATIBILITY_OUTCOMES = ["compatible", "breaking", "unknown", "invalid", "not-applicable"] as const;

export function validateOperationalMetrics(value: unknown): void {
    const metrics = exactObject(value, [
        "operations",
        "compatibility",
        "publicPackages",
        "repositoryReads",
        "snapshot",
        "filesystem",
    ]);
    const operations = exactObject(metrics.operations, ["stablePromotion", "compatibilityReevaluation"]);
    validateOperationCounter(operations.stablePromotion);
    validateOperationCounter(operations.compatibilityReevaluation);
    validateCounts(metrics.compatibility, ["reevaluations", "warnings"]);
    validateCounts(metrics.publicPackages, [
        "packagesServed",
        "packageBytes",
        "releaseNotesServed",
        "releaseNotesBytes",
        "rateLimitRejections",
        "downloadRateLimitRejections",
    ]);
    validateCounts(metrics.repositoryReads, [
        "total",
        "succeeded",
        "notFound",
        "rejected",
        "failed",
        "totalDurationMs",
        "maximumDurationMs",
    ]);
    validateCounts(metrics.snapshot, ["integrations", "versions", "diagnostics", "quarantined", "recoveryDiagnostics"]);
    validateFilesystem(metrics.filesystem);
}

export function validateRecentOperations(value: unknown): void {
    array(value, 100).forEach((item) => {
        const entry = exactObject(
            item,
            ["timestamp", "operation", "operationId", "outcome", "durationMs"],
            [
                "kind",
                "version",
                "digest",
                "reportId",
                "reportRevisionId",
                "evaluatorName",
                "evaluatorVersion",
                "compatibilityOutcome",
                "errorCode",
            ],
        );
        isoTimestamp(entry.timestamp);
        enumValue(entry.operation, OPERATIONS);
        canonicalText(entry.operationId, 512);
        enumValue(entry.outcome, OPERATION_OUTCOMES);
        nonNegativeInteger(entry.durationMs);
        if (entry.kind !== undefined) {
            packageKind(entry.kind);
        }
        if (entry.version !== undefined) {
            packageVersion(entry.version);
        }
        if (entry.digest !== undefined) {
            digest(entry.digest);
        }
        for (const key of ["reportId", "reportRevisionId", "evaluatorName", "evaluatorVersion", "errorCode"]) {
            if (entry[key] !== undefined) {
                canonicalText(entry[key], 512);
            }
        }
        if (entry.compatibilityOutcome !== undefined) {
            enumValue(entry.compatibilityOutcome, COMPATIBILITY_OUTCOMES);
        }
    });
}

function validateOperationCounter(value: unknown): void {
    validateCounts(value, [
        "attempted",
        "inFlight",
        "succeeded",
        "rejected",
        "failed",
        "totalDurationMs",
        "maximumDurationMs",
    ]);
}

function validateCounts(value: unknown, keys: readonly string[]): void {
    const counts = exactObject(value, keys);
    for (const key of keys) {
        nonNegativeInteger(counts[key]);
    }
}

function validateFilesystem(value: unknown): void {
    const filesystem = exactObject(
        value,
        ["status"],
        ["checkedAt", "totalBytes", "freeBytes", "availableBytes", "usedBytes", "usedBasisPoints"],
    );
    const status = enumValue(filesystem.status, ["available", "unavailable"] as const);
    if (filesystem.checkedAt !== undefined) {
        isoTimestamp(filesystem.checkedAt);
    }
    if (status === "unavailable") {
        return;
    }
    for (const key of ["totalBytes", "freeBytes", "availableBytes", "usedBytes"]) {
        decimalBytes(filesystem[key]);
    }
    const basisPoints = nonNegativeInteger(filesystem.usedBasisPoints);
    if (basisPoints > 10_000) {
        throw new TypeError("Repository filesystem utilization is invalid");
    }
}

function decimalBytes(value: unknown): void {
    if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,30})$/u.test(value)) {
        throw new TypeError("Repository filesystem capacity is invalid");
    }
}
