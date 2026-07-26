import type {
    RepositoryDiagnosticsView,
    RepositoryDiagnosticView,
    RepositoryQuarantineView,
    RepositoryStatusView,
    RepositoryVersionCompatibilityView,
    RepositoryVersionsView,
} from "./types";

const MAX_ITEMS = 4_096;
const MAX_TEXT = 16_384;

export class RepositoryUiContractError extends Error {
    constructor() {
        super("Repository response is invalid");
        this.name = "RepositoryUiContractError";
    }
}

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
    };
}

export function parseRepositoryDiagnostics(value: unknown): RepositoryDiagnosticsView {
    const object = readRecord(value);
    return {
        health: readText(object.health),
        diagnostics: readArray(object.diagnostics).map(parseDiagnostic),
        quarantined: readArray(object.quarantined).map(parseQuarantine),
        recovery: readArray(object.recovery).map(parseDiagnostic),
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
                ...(version.compatibility === null || version.compatibility === undefined
                    ? {}
                    : { compatibility: parseVersionCompatibility(version.compatibility) }),
            };
        }),
    };
}

export function readRecord(value: unknown): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RepositoryUiContractError();
    }
    return value as Readonly<Record<string, unknown>>;
}

export function readArray(value: unknown, maximum = MAX_ITEMS): readonly unknown[] {
    if (!Array.isArray(value) || value.length > maximum) {
        throw new RepositoryUiContractError();
    }
    return value;
}

export function readText(value: unknown): string {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_TEXT) {
        throw new RepositoryUiContractError();
    }
    return value;
}

export function readOptionalText(value: unknown): string | undefined {
    return value === undefined || value === null ? undefined : readText(value);
}

export function readBoolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw new RepositoryUiContractError();
    }
    return value;
}

export function readCount(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new RepositoryUiContractError();
    }
    return value as number;
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

export function optionalProperty<Key extends string, Value>(
    key: Key,
    value: Value | undefined,
): Partial<Record<Key, Value>> {
    return value === undefined ? {} : ({ [key]: value } as Record<Key, Value>);
}
