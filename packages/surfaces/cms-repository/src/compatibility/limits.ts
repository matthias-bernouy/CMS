import { IntegrationRepositoryContractError } from "@bernouy/cms-integrations";

export const PUBLIC_COMPATIBILITY_LIMITS = Object.freeze({
    pageSize: 100,
    defaultPageSize: 50,
    totalRevisions: 4_096,
    baselines: 16,
    evidencePerReport: 256,
    evidenceIds: 256,
    identifierBytes: 256,
    shortTextBytes: 1_024,
    messageBytes: 8_192,
    responseBytes: 1_048_576,
});

const encoder = new TextEncoder();

export function sourceText(value: unknown, maximumBytes: number): string {
    if (typeof value !== "string" || value.length === 0 || encoder.encode(value).byteLength > maximumBytes) {
        throw invalidSource();
    }
    return value;
}

export function sourceIdentifier(value: unknown): string {
    const text = sourceText(value, PUBLIC_COMPATIBILITY_LIMITS.identifierBytes);
    if (/\p{Cc}/u.test(text)) {
        throw invalidSource();
    }
    return text;
}

export function optionalSourceText(value: unknown, maximumBytes: number): string | undefined {
    return value === undefined ? undefined : sourceText(value, maximumBytes);
}

export function sourceArray(value: unknown, maximumItems: number): readonly unknown[] {
    if (!Array.isArray(value) || value.length > maximumItems) {
        throw invalidSource();
    }
    return value;
}

export function sourceBoolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw invalidSource();
    }
    return value;
}

export function sourceRecord(value: unknown): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw invalidSource();
    }
    return value as Readonly<Record<string, unknown>>;
}

export function assertPublicResponseSize(value: unknown): void {
    if (encoder.encode(JSON.stringify(value)).byteLength > PUBLIC_COMPATIBILITY_LIMITS.responseBytes) {
        throw invalidSource();
    }
}

export function invalidSource(): IntegrationRepositoryContractError {
    return new IntegrationRepositoryContractError();
}
