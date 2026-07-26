import type {
    RepositoryDiagnosticsView,
    RepositoryDiagnosticView,
    RepositoryQuarantineView,
    RepositoryStatusView,
    RepositoryVersionCompatibilityView,
    RepositoryVersionsView,
} from "./types";
import { parseRepositoryMetrics, parseRepositoryRecentOperations } from "./observability";
import { optionalProperty, readArray, readBoolean, readCount, readOptionalText, readRecord, readText } from "./parsing";

export function parseRepositoryStatus(value: unknown): RepositoryStatusView {
    const object = readRecord(value);
    return {
        ready: readBoolean(object.ready),
        health: readText(object.health),
        integrations: readCount(object.integrations),
        versions: readCount(object.versions),
        diagnostics: readCount(object.diagnostics),
        quarantined: readCount(object.quarantined),
        recoveryDiagnostics: readCount(object.recoveryDiagnostics),
        ...(object.metrics === undefined ? {} : { metrics: parseRepositoryMetrics(object.metrics) }),
    };
}

export function parseRepositoryDiagnostics(value: unknown): RepositoryDiagnosticsView {
    const object = readRecord(value);
    return {
        health: readText(object.health),
        diagnostics: readArray(object.diagnostics).map(parseDiagnostic),
        quarantined: readArray(object.quarantined).map(parseQuarantine),
        recovery: readArray(object.recovery).map(parseDiagnostic),
        ...(object.metrics === undefined ? {} : { metrics: parseRepositoryMetrics(object.metrics) }),
        recentOperations:
            object.recentOperations === undefined ? [] : parseRepositoryRecentOperations(object.recentOperations),
    };
}

export function parseRepositoryVersions(value: unknown): RepositoryVersionsView {
    const object = readRecord(value);
    return {
        kind: readText(object.kind),
        ...optionalProperty("stable", readOptionalText(object.stable)),
        ...optionalProperty("latest", readOptionalText(object.latest)),
        versions: readArray(object.versions).map((entry) => {
            const version = readRecord(entry);
            return {
                version: readText(version.version),
                ...optionalProperty("digest", readOptionalText(version.digest)),
                ...optionalProperty("status", readOptionalText(version.status)),
                ...(version.blockPreview === undefined
                    ? {}
                    : { blockPreview: parseChannelPreview(version.blockPreview) }),
                ...(version.release === undefined ? {} : { release: parseVersionRelease(version.release) }),
                ...(version.compatibility === null || version.compatibility === undefined
                    ? {}
                    : { compatibility: parseVersionCompatibility(version.compatibility) }),
            };
        }),
    };
}

function parseChannelPreview(value: unknown) {
    const source = readRecord(value);
    return { current: parseChannels(source.current), next: parseChannels(source.next) };
}

function parseChannels(value: unknown) {
    const source = readRecord(value);
    return {
        ...optionalProperty("stable", readOptionalText(source.stable)),
        ...optionalProperty("latest", readOptionalText(source.latest)),
    };
}

function parseVersionRelease(value: unknown) {
    const source = readRecord(value);
    return {
        ...optionalProperty("verificationDigest", readOptionalText(source.verificationDigest)),
        ...optionalProperty("verificationOrigin", readOptionalText(source.verificationOrigin)),
        ...optionalProperty("verificationOutcome", readOptionalText(source.verificationOutcome)),
        ...optionalProperty("decisionRevisionId", readOptionalText(source.decisionRevisionId)),
        ...optionalProperty("decisionDigest", readOptionalText(source.decisionDigest)),
        admissible: readBoolean(source.admissible),
    };
}

function parseDiagnostic(value: unknown): RepositoryDiagnosticView {
    const object = readRecord(value);
    return {
        code: readText(object.code),
        message: readText(object.message),
        ...optionalProperty("stage", readOptionalText(object.stage)),
        ...optionalProperty("kind", readOptionalText(object.kind)),
        ...optionalProperty("version", readOptionalText(object.version)),
        ...optionalProperty("operationId", readOptionalText(object.operationId)),
    };
}

function parseQuarantine(value: unknown): RepositoryQuarantineView {
    const object = readRecord(value);
    return {
        ...optionalProperty("kind", readOptionalText(object.kind)),
        diagnosticCodes: readArray(object.diagnosticCodes, 256).map(readText),
    };
}

function parseVersionCompatibility(value: unknown): RepositoryVersionCompatibilityView {
    const object = readRecord(value);
    return {
        admissionReportId: readText(object.admissionReportId),
        currentReportRevisionId: readText(object.currentReportRevisionId),
        outcome: readText(object.outcome),
        admissible: readBoolean(object.admissible),
        warning: readBoolean(object.warning),
    };
}
