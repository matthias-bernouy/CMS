import { readArray, readCount, readOptionalText, readRecord, readText } from "./parsing";

export type RepositoryOperationCounterView = Readonly<{
    attempted: number;
    inFlight: number;
    succeeded: number;
    rejected: number;
    failed: number;
    totalDurationMs: number;
    maximumDurationMs: number;
}>;

export type RepositoryMetricsView = Readonly<{
    operations: Readonly<{
        publication: RepositoryOperationCounterView;
        stablePromotion: RepositoryOperationCounterView;
        compatibilityReevaluation: RepositoryOperationCounterView;
    }>;
    compatibility: Readonly<{ reevaluations: number; warnings: number }>;
    publicPackages: Readonly<{
        packagesServed: number;
        packageBytes: number;
        releaseNotesServed: number;
        releaseNotesBytes: number;
        rateLimitRejections: number;
        downloadRateLimitRejections: number;
    }>;
    snapshot: Readonly<{
        integrations: number;
        versions: number;
        diagnostics: number;
        quarantined: number;
        recoveryDiagnostics: number;
    }>;
    filesystem:
        | Readonly<{ status: "unavailable"; checkedAt?: string }>
        | Readonly<{
              status: "available";
              checkedAt?: string;
              totalBytes: string;
              freeBytes: string;
              availableBytes: string;
              usedBytes: string;
              usedBasisPoints: number;
          }>;
}>;

export type RepositoryRecentOperationView = Readonly<{
    timestamp: string;
    operation: string;
    operationId: string;
    outcome: string;
    durationMs: number;
    kind?: string;
    version?: string;
    digest?: string;
    reportId?: string;
    reportRevisionId?: string;
    evaluatorName?: string;
    evaluatorVersion?: string;
    compatibilityOutcome?: string;
    errorCode?: string;
}>;

export function parseRepositoryMetrics(value: unknown): RepositoryMetricsView {
    const metrics = readRecord(value);
    const operations = readRecord(metrics.operations);
    const compatibility = readRecord(metrics.compatibility);
    const publicPackages = readRecord(metrics.publicPackages);
    const snapshot = readRecord(metrics.snapshot);
    return {
        operations: {
            publication: operationCounter(operations.publication),
            stablePromotion: operationCounter(operations.stablePromotion),
            compatibilityReevaluation: operationCounter(operations.compatibilityReevaluation),
        },
        compatibility: {
            reevaluations: readCount(compatibility.reevaluations),
            warnings: readCount(compatibility.warnings),
        },
        publicPackages: {
            packagesServed: readCount(publicPackages.packagesServed),
            packageBytes: readCount(publicPackages.packageBytes),
            releaseNotesServed: readCount(publicPackages.releaseNotesServed),
            releaseNotesBytes: readCount(publicPackages.releaseNotesBytes),
            rateLimitRejections: readCount(publicPackages.rateLimitRejections),
            downloadRateLimitRejections: readCount(publicPackages.downloadRateLimitRejections),
        },
        snapshot: {
            integrations: readCount(snapshot.integrations),
            versions: readCount(snapshot.versions),
            diagnostics: readCount(snapshot.diagnostics),
            quarantined: readCount(snapshot.quarantined),
            recoveryDiagnostics: readCount(snapshot.recoveryDiagnostics),
        },
        filesystem: filesystem(metrics.filesystem),
    };
}

export function parseRepositoryRecentOperations(value: unknown): readonly RepositoryRecentOperationView[] {
    return readArray(value, 100).map((item) => {
        const operation = readRecord(item);
        return {
            timestamp: readText(operation.timestamp),
            operation: readText(operation.operation),
            operationId: readText(operation.operationId),
            outcome: readText(operation.outcome),
            durationMs: readCount(operation.durationMs),
            ...optionalTextFields(operation, [
                "kind",
                "version",
                "digest",
                "reportId",
                "reportRevisionId",
                "evaluatorName",
                "evaluatorVersion",
                "compatibilityOutcome",
                "errorCode",
            ]),
        };
    });
}

function operationCounter(value: unknown): RepositoryOperationCounterView {
    const counter = readRecord(value);
    return {
        attempted: readCount(counter.attempted),
        inFlight: readCount(counter.inFlight),
        succeeded: readCount(counter.succeeded),
        rejected: readCount(counter.rejected),
        failed: readCount(counter.failed),
        totalDurationMs: readCount(counter.totalDurationMs),
        maximumDurationMs: readCount(counter.maximumDurationMs),
    };
}

function filesystem(value: unknown): RepositoryMetricsView["filesystem"] {
    const capacity = readRecord(value);
    const checkedAt = readOptionalText(capacity.checkedAt);
    if (capacity.status === "unavailable") {
        return { status: "unavailable", ...(checkedAt ? { checkedAt } : {}) };
    }
    if (capacity.status !== "available") {
        throw new TypeError("Repository filesystem status is invalid");
    }
    return {
        status: "available",
        ...(checkedAt ? { checkedAt } : {}),
        totalBytes: decimalBytes(capacity.totalBytes),
        freeBytes: decimalBytes(capacity.freeBytes),
        availableBytes: decimalBytes(capacity.availableBytes),
        usedBytes: decimalBytes(capacity.usedBytes),
        usedBasisPoints: readCount(capacity.usedBasisPoints),
    };
}

function decimalBytes(value: unknown): string {
    const text = readText(value);
    if (!/^(0|[1-9][0-9]{0,30})$/u.test(text)) {
        throw new TypeError("Repository capacity is invalid");
    }
    return text;
}

function optionalTextFields(
    source: Readonly<Record<string, unknown>>,
    keys: readonly string[],
): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of keys) {
        const value = readOptionalText(source[key]);
        if (value) {
            result[key] = value;
        }
    }
    return result;
}
