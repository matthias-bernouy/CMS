import { randomUUID } from "node:crypto";
import type { PublicPackageReadObservation, PublicRepositoryReadObservation } from "@bernouy/cms-repository";
import type { IntegrationCompatibilityReport } from "@bernouy/cms-integration-registry";
import type {
    RepositoryOperationalSnapshot,
    RepositoryOperation,
    RepositoryOperationCounter,
    RepositoryOperationIdentity,
    RepositoryOperationLogEntry,
    RepositoryOperationLogSink,
    RepositoryOperationOutcome,
    RepositoryOperationSpan,
    RepositoryCandidateGarbageCollectionLogEntry,
    RepositoryOperationalLogEntry,
} from "./contracts";
import { RepositoryCandidateGarbageCollectionMetrics } from "../candidates/garbageCollectionMetrics";
import { repositoryOperationLogEntry, safeLogText, safeOperationIdentity } from "./logEntry";

const OPERATIONS = ["stable-promotion", "compatibility-reevaluation"] as const;
const DEFAULT_RECENT_OPERATION_LIMIT = 32;
const MAX_RECENT_OPERATION_LIMIT = 100;

type MutableCounter = {
    attempted: number;
    inFlight: number;
    succeeded: number;
    rejected: number;
    failed: number;
    totalDurationMs: number;
    maximumDurationMs: number;
};

export class RepositoryOperationalTelemetry {
    private readonly counters = Object.fromEntries(
        OPERATIONS.map((operation) => [operation, emptyCounter()]),
    ) as Record<RepositoryOperation, MutableCounter>;
    private readonly recentOperations: RepositoryOperationLogEntry[] = [];
    private readonly recentOperationLimit: number;
    private reevaluations = 0;
    private warnings = 0;
    private packagesServed = 0;
    private packageBytes = 0;
    private releaseNotesServed = 0;
    private releaseNotesBytes = 0;
    private rateLimitRejections = 0;
    private downloadRateLimitRejections = 0;
    private readonly repositoryReads = {
        total: 0,
        succeeded: 0,
        notFound: 0,
        rejected: 0,
        failed: 0,
        totalDurationMs: 0,
        maximumDurationMs: 0,
    };
    private readonly candidateGarbageCollection = new RepositoryCandidateGarbageCollectionMetrics();

    constructor(
        private readonly options: Readonly<{
            now?: () => Date;
            durationNow?: () => number;
            createOperationId?: () => string;
            log?: RepositoryOperationLogSink;
            recentOperationLimit?: number;
        }> = {},
    ) {
        const limit = options.recentOperationLimit ?? DEFAULT_RECENT_OPERATION_LIMIT;
        if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_RECENT_OPERATION_LIMIT) {
            throw new TypeError(
                `Repository recent operation limit must be between 0 and ${MAX_RECENT_OPERATION_LIMIT}`,
            );
        }
        this.recentOperationLimit = limit;
    }

    start(operation: RepositoryOperation, identity: RepositoryOperationIdentity): RepositoryOperationSpan {
        const counter = this.counters[operation];
        counter.attempted = increment(counter.attempted);
        counter.inFlight = increment(counter.inFlight);
        return {
            operation,
            operationId: safeLogText(this.options.createOperationId?.() ?? randomUUID()) ?? "unavailable",
            startedAt: this.durationNow(),
            identity: safeOperationIdentity(identity),
        };
    }

    finish(
        span: RepositoryOperationSpan,
        outcome: RepositoryOperationOutcome,
        details: Readonly<{
            operationId?: string;
            digest?: string;
            report?: IntegrationCompatibilityReport;
            reportRevisionId?: string;
            errorCode?: string;
        }> = {},
    ): void {
        const counter = this.counters[span.operation];
        const durationMs = safeDuration(this.durationNow() - span.startedAt);
        counter.inFlight = Math.max(0, counter.inFlight - 1);
        counter[outcome] = increment(counter[outcome]);
        counter.totalDurationMs = add(counter.totalDurationMs, durationMs);
        counter.maximumDurationMs = Math.max(counter.maximumDurationMs, durationMs);
        if (span.operation === "compatibility-reevaluation" && outcome === "succeeded") {
            this.reevaluations = increment(this.reevaluations);
        }
        if (details.report && !details.report.admissible) {
            this.warnings = increment(this.warnings);
        }
        this.record(repositoryOperationLogEntry(span, outcome, durationMs, details, this.now().toISOString()));
    }

    observePublicPackageRead(observation: PublicPackageReadObservation): void {
        if (observation.outcome === "rate-limited") {
            this.rateLimitRejections = increment(this.rateLimitRejections);
            if (observation.budget === "download") {
                this.downloadRateLimitRejections = increment(this.downloadRateLimitRejections);
            }
            return;
        }
        if (observation.resource === "package") {
            this.packagesServed = increment(this.packagesServed);
            this.packageBytes = add(this.packageBytes, observation.bytes);
        } else {
            this.releaseNotesServed = increment(this.releaseNotesServed);
            this.releaseNotesBytes = add(this.releaseNotesBytes, observation.bytes);
        }
    }

    observePublicRead(observation: PublicRepositoryReadObservation): void {
        const durationMs = safeDuration(observation.durationMs);
        this.repositoryReads.total = increment(this.repositoryReads.total);
        this.repositoryReads.totalDurationMs = add(this.repositoryReads.totalDurationMs, durationMs);
        this.repositoryReads.maximumDurationMs = Math.max(this.repositoryReads.maximumDurationMs, durationMs);
        const outcome =
            observation.status < 400
                ? "succeeded"
                : observation.status === 404
                  ? "notFound"
                  : observation.status < 500
                    ? "rejected"
                    : "failed";
        this.repositoryReads[outcome] = increment(this.repositoryReads[outcome]);
    }

    observeCandidateGarbageCollection(observation: RepositoryCandidateGarbageCollectionLogEntry): void {
        this.candidateGarbageCollection.observe(observation);
        this.emit(observation);
    }

    snapshot(): RepositoryOperationalSnapshot {
        return {
            operations: Object.fromEntries(
                OPERATIONS.map((operation) => [operation, { ...this.counters[operation] }]),
            ) as Record<RepositoryOperation, RepositoryOperationCounter>,
            compatibility: { reevaluations: this.reevaluations, warnings: this.warnings },
            publicPackages: {
                packagesServed: this.packagesServed,
                packageBytes: this.packageBytes,
                releaseNotesServed: this.releaseNotesServed,
                releaseNotesBytes: this.releaseNotesBytes,
                rateLimitRejections: this.rateLimitRejections,
                downloadRateLimitRejections: this.downloadRateLimitRejections,
            },
            repositoryReads: { ...this.repositoryReads },
            candidateGarbageCollection: this.candidateGarbageCollection.snapshot(),
            recentOperations: this.recentOperations.map((entry) => ({ ...entry })),
        };
    }

    private record(entry: RepositoryOperationLogEntry): void {
        if (this.recentOperationLimit > 0) {
            this.recentOperations.push(entry);
            if (this.recentOperations.length > this.recentOperationLimit) {
                this.recentOperations.shift();
            }
        }
        this.emit(entry);
    }

    private emit(entry: RepositoryOperationalLogEntry): void {
        try {
            this.options.log?.(entry);
        } catch {
            // Logging must never decide whether a registry mutation succeeds.
        }
    }

    private now(): Date {
        return (this.options.now ?? (() => new Date()))();
    }

    private durationNow(): number {
        return (this.options.durationNow ?? Date.now)();
    }
}

export function createConsoleRepositoryOperationLogSink(
    write: (line: string) => void = (line) => console.info(line),
): RepositoryOperationLogSink {
    return (entry) => write(JSON.stringify(entry));
}

function safeDuration(value: number): number {
    return Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(value))) : 0;
}

function emptyCounter(): MutableCounter {
    return {
        attempted: 0,
        inFlight: 0,
        succeeded: 0,
        rejected: 0,
        failed: 0,
        totalDurationMs: 0,
        maximumDurationMs: 0,
    };
}

function increment(value: number): number {
    return value >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : value + 1;
}

function add(value: number, incrementBy: number): number {
    return Math.min(Number.MAX_SAFE_INTEGER, value + incrementBy);
}
