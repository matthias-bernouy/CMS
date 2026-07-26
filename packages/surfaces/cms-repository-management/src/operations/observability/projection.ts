import type { RepositoryManagementOperationalReadSource, RepositoryManagementSnapshotMetric } from "./contracts";
const OPERATIONS = ["publication", "stable-promotion", "compatibility-reevaluation"] as const;
const OPERATION_OUTCOMES = ["succeeded", "rejected", "failed"] as const;
const COMPATIBILITY_OUTCOMES = ["compatible", "breaking", "unknown", "invalid", "not-applicable"] as const;
const MAX_RECENT_OPERATIONS = 100;
const MAX_TEXT_BYTES = 512;

export async function projectRepositoryOperationalRead(
    source: RepositoryManagementOperationalReadSource,
    snapshot: RepositoryManagementSnapshotMetric,
) {
    const operational = record(source.snapshot());
    const filesystem = await projectFilesystem(source);
    return {
        metrics: {
            operations: operationMetrics(operational.operations),
            compatibility: compatibilityMetrics(operational.compatibility),
            publicPackages: publicPackageMetrics(operational.publicPackages),
            snapshot,
            filesystem,
        },
        recentOperations: recentOperations(operational.recentOperations),
    };
}

async function projectFilesystem(source: RepositoryManagementOperationalReadSource) {
    try {
        const value = record(await source.filesystemCapacity());
        if (value.status !== "available") {
            return {
                status: "unavailable" as const,
                ...(isoTimestamp(value.checkedAt) ? { checkedAt: value.checkedAt } : {}),
            };
        }
        return {
            status: "available" as const,
            ...(isoTimestamp(value.checkedAt) ? { checkedAt: value.checkedAt } : {}),
            totalBytes: decimalBytes(value.totalBytes),
            freeBytes: decimalBytes(value.freeBytes),
            availableBytes: decimalBytes(value.availableBytes),
            usedBytes: decimalBytes(value.usedBytes),
            usedBasisPoints: count(value.usedBasisPoints, 10_000),
        };
    } catch {
        return { status: "unavailable" as const };
    }
}

function operationMetrics(value: unknown) {
    const metrics = record(value);
    return {
        publication: operationCounter(metrics.publication),
        stablePromotion: operationCounter(metrics["stable-promotion"]),
        compatibilityReevaluation: operationCounter(metrics["compatibility-reevaluation"]),
    };
}

function operationCounter(value: unknown) {
    const counter = record(value);
    return {
        attempted: count(counter.attempted),
        inFlight: count(counter.inFlight),
        succeeded: count(counter.succeeded),
        rejected: count(counter.rejected),
        failed: count(counter.failed),
        totalDurationMs: count(counter.totalDurationMs),
        maximumDurationMs: count(counter.maximumDurationMs),
    };
}

function compatibilityMetrics(value: unknown) {
    const metrics = record(value);
    return { reevaluations: count(metrics.reevaluations), warnings: count(metrics.warnings) };
}

function publicPackageMetrics(value: unknown) {
    const metrics = record(value);
    return {
        packagesServed: count(metrics.packagesServed),
        packageBytes: count(metrics.packageBytes),
        releaseNotesServed: count(metrics.releaseNotesServed),
        releaseNotesBytes: count(metrics.releaseNotesBytes),
        rateLimitRejections: count(metrics.rateLimitRejections),
        downloadRateLimitRejections: count(metrics.downloadRateLimitRejections),
    };
}

function recentOperations(value: unknown) {
    return Array.isArray(value)
        ? value.slice(-MAX_RECENT_OPERATIONS).flatMap((entry) => {
              try {
                  return [recentOperation(entry)];
              } catch {
                  return [];
              }
          })
        : [];
}

function recentOperation(value: unknown) {
    const entry = record(value);
    const operation = enumText(entry.operation, OPERATIONS);
    const outcome = enumText(entry.outcome, OPERATION_OUTCOMES);
    const result: Record<string, string | number> = {
        timestamp: requiredTimestamp(entry.timestamp),
        operation,
        operationId: requiredText(entry.operationId),
        outcome,
        durationMs: count(entry.durationMs),
    };
    optionalTextField(result, entry, "kind");
    optionalTextField(result, entry, "version");
    optionalTextField(result, entry, "reportId");
    optionalTextField(result, entry, "reportRevisionId");
    optionalTextField(result, entry, "evaluatorName");
    optionalTextField(result, entry, "evaluatorVersion");
    optionalTextField(result, entry, "errorCode");
    if (typeof entry.digest === "string" && /^[a-f0-9]{64}$/u.test(entry.digest)) {
        result.digest = entry.digest;
    }
    if (typeof entry.compatibilityOutcome === "string") {
        result.compatibilityOutcome = enumText(entry.compatibilityOutcome, COMPATIBILITY_OUTCOMES);
    }
    return result;
}

function optionalTextField(
    target: Record<string, string | number>,
    source: Record<string, unknown>,
    key: string,
): void {
    const value = boundedText(source[key]);
    if (value) {
        target[key] = value;
    }
}

function count(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, maximum) : 0;
}

function decimalBytes(value: unknown): string {
    return typeof value === "string" && /^(0|[1-9][0-9]{0,30})$/u.test(value) ? value : "0";
}

function requiredText(value: unknown): string {
    const text = boundedText(value);
    if (!text) {
        throw new TypeError("Operational text is invalid");
    }
    return text;
}

function boundedText(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 && new TextEncoder().encode(value).byteLength <= MAX_TEXT_BYTES
        ? value
        : undefined;
}

function requiredTimestamp(value: unknown): string {
    if (!isoTimestamp(value)) {
        throw new TypeError("Operational timestamp is invalid");
    }
    return value;
}

function isoTimestamp(value: unknown): value is string {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value);
}

function enumText<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
    if (typeof value !== "string" || !allowed.includes(value)) {
        throw new TypeError("Operational enum is invalid");
    }
    return value as T[number];
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
