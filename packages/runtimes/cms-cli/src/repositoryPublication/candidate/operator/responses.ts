import { assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type {
    ChannelPreview,
    DecisionReference,
    ReportReference,
    RepositoryOperatorMutationSuccess,
    RepositoryOperatorRequest,
} from "./contracts";

export function parseReleaseDecision(
    body: Readonly<Record<string, unknown>>,
    kind: string,
    version: string,
): DecisionReference | null {
    if (body.kind !== kind || body.version !== version) {
        return null;
    }
    const decision = record(body.decision);
    return decision ? decisionReference(decision.decisionId, decision.decisionDigest) : null;
}

export function parseVersionForBlock(
    body: Readonly<Record<string, unknown>>,
    kind: string,
    version: string,
): Readonly<{ decision: DecisionReference }> | null {
    if (body.kind !== kind || !Array.isArray(body.versions)) {
        return null;
    }
    const matches = body.versions.filter((entry) => record(entry)?.version === version);
    if (matches.length !== 1) {
        return null;
    }
    const release = record(record(matches[0])?.release);
    const decision = release ? decisionReference(release.decisionRevisionId, release.decisionDigest) : null;
    return decision ? { decision } : null;
}

export function parseCompatibilityReference(
    body: Readonly<Record<string, unknown>>,
    kind: string,
    version: string,
): ReportReference | null {
    const current = record(body.current);
    if (
        !current ||
        current.kind !== kind ||
        current.version !== version ||
        current.reportId !== body.currentRevisionId ||
        !canonicalText(body.currentRevisionId) ||
        !sha256(body.currentReportDigest)
    ) {
        return null;
    }
    return { revisionId: body.currentRevisionId, reportDigest: body.currentReportDigest };
}

export function parseMutationSuccess(
    body: Readonly<Record<string, unknown>>,
    request: RepositoryOperatorRequest,
): RepositoryOperatorMutationSuccess | null {
    if (request.type === "reevaluate") {
        const revision = record(body.revision);
        const currentReport = record(body.currentReport);
        if (
            !revision ||
            revision.kind !== request.kind ||
            revision.version !== request.version ||
            !identifier(revision.reportId) ||
            !currentReport ||
            currentReport.revisionId !== revision.reportId ||
            !sha256(currentReport.reportDigest)
        ) {
            return null;
        }
        return { reference: revision.reportId };
    }
    const recordValue = record(body.record);
    if (
        !recordValue ||
        recordValue.kind !== request.kind ||
        recordValue.version !== request.version ||
        !identifier(body.operationId) ||
        recordValue.operationId !== body.operationId
    ) {
        return null;
    }
    if (request.type === "block") {
        const preview = channelRepair(recordValue.previousChannels, recordValue.nextChannels);
        return recordValue.action === "block" && preview ? { reference: body.operationId, preview } : null;
    }
    return { reference: body.operationId };
}

export function safeCode(value: unknown): string | undefined {
    return typeof value === "string" && /^[a-z0-9_]{1,80}$/u.test(value) ? value : undefined;
}

function decisionReference(revisionId: unknown, digest: unknown): DecisionReference | null {
    return canonicalText(revisionId) && sha256(digest) ? { revisionId, digest } : null;
}

function channelRepair(previousChannels: unknown, nextChannels: unknown): ChannelPreview | null {
    const current = channelSet(previousChannels);
    const next = channelSet(nextChannels);
    return current && next ? { current, next } : null;
}

function channelSet(value: unknown): Readonly<{ stable?: string; latest?: string }> | null {
    const input = record(value);
    if (!input || Object.keys(input).some((key) => key !== "stable" && key !== "latest")) {
        return null;
    }
    if (
        (input.stable !== undefined && !integrationVersion(input.stable)) ||
        (input.latest !== undefined && !integrationVersion(input.latest))
    ) {
        return null;
    }
    return {
        ...(typeof input.stable === "string" ? { stable: input.stable } : {}),
        ...(typeof input.latest === "string" ? { latest: input.latest } : {}),
    };
}

function integrationVersion(value: unknown): value is string {
    if (typeof value !== "string") {
        return false;
    }
    try {
        assertIntegrationPackageVersion(value);
        return true;
    } catch {
        return false;
    }
}

function identifier(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function sha256(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function canonicalText(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= 512 &&
        value.trim() === value &&
        !/[\u0000-\u001f\u007f]/u.test(value)
    );
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Readonly<Record<string, unknown>>)
        : null;
}
