import type { IntegrationCompatibilityReport } from "@bernouy/cms-integration-registry";
import type {
    RepositoryOperationIdentity,
    RepositoryOperationLogEntry,
    RepositoryOperationOutcome,
    RepositoryOperationSpan,
} from "./contracts";

const MAX_LOG_TEXT_BYTES = 256;

export function repositoryOperationLogEntry(
    span: RepositoryOperationSpan,
    outcome: RepositoryOperationOutcome,
    durationMs: number,
    details: Readonly<{
        operationId?: string;
        digest?: string;
        report?: IntegrationCompatibilityReport;
        reportRevisionId?: string;
        errorCode?: string;
    }>,
    timestamp: string,
): RepositoryOperationLogEntry {
    const report = details.report;
    return {
        schema: "cms.repository.operation.v1",
        timestamp,
        operation: span.operation,
        operationId: safeLogText(details.operationId) ?? span.operationId,
        outcome,
        durationMs,
        ...span.identity,
        ...(safeDigest(details.digest) ? { digest: safeDigest(details.digest) } : {}),
        ...(report
            ? {
                  reportId: safeLogText(report.id),
                  reportRevisionId: safeLogText(details.reportRevisionId ?? report.id),
                  evaluatorName: safeLogText(report.evaluator.name),
                  evaluatorVersion: safeLogText(report.evaluator.version),
                  compatibilityOutcome: report.outcome,
              }
            : safeLogText(details.reportRevisionId)
              ? { reportRevisionId: safeLogText(details.reportRevisionId) }
              : {}),
        ...(safeCode(details.errorCode) ? { errorCode: safeCode(details.errorCode) } : {}),
    };
}

export function safeOperationIdentity(identity: RepositoryOperationIdentity): RepositoryOperationIdentity {
    return {
        ...(safeLogText(identity.kind) ? { kind: safeLogText(identity.kind) } : {}),
        ...(safeLogText(identity.version) ? { version: safeLogText(identity.version) } : {}),
        ...(safeDigest(identity.digest) ? { digest: safeDigest(identity.digest) } : {}),
        ...(safeLogText(identity.reportRevisionId) ? { reportRevisionId: safeLogText(identity.reportRevisionId) } : {}),
    };
}

export function safeLogText(value: string | undefined): string | undefined {
    if (
        !value ||
        /[\u0000-\u001f\u007f]/u.test(value) ||
        new TextEncoder().encode(value).byteLength > MAX_LOG_TEXT_BYTES
    ) {
        return undefined;
    }
    return value;
}

function safeCode(value: string | undefined): string | undefined {
    return value && /^[a-z0-9_-]{1,128}$/u.test(value) ? value : undefined;
}

function safeDigest(value: string | undefined): string | undefined {
    return value && /^[a-f0-9]{64}$/u.test(value) ? value : undefined;
}
