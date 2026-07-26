import { IntegrationRegistryCandidateError } from "cms-integration-registry/core/publication/candidates/errors";
import { assertSha256Digest } from "../layout";

export function strictRecord(value: unknown, source: string, fields: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalid(`${source} must be an object`);
    }
    const input = value as Record<string, unknown>;
    const unknown = Object.keys(input).filter((field) => !fields.includes(field));
    if (unknown.length > 0) {
        invalid(`${source} contains unknown field ${unknown[0]}`);
    }
    return input;
}

export function digest(value: unknown, field: string): string {
    const parsed = text(value, field);
    try {
        assertSha256Digest(parsed);
    } catch {
        invalid(`Candidate ${field} must be lowercase SHA-256`);
    }
    return parsed;
}

export function identifier(value: unknown, field: string): string {
    const parsed = text(value, field);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(parsed)) {
        invalid(`Candidate ${field} must be a path-safe identifier`);
    }
    return parsed;
}

export function text(value: unknown, field: string): string {
    if (typeof value !== "string") {
        invalid(`Candidate ${field} must be text`);
    }
    return value;
}

export function safeInteger(value: unknown, field: string): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        invalid(`Candidate ${field} must be a non-negative safe integer`);
    }
    return Number(value);
}

export function timestamp(value: unknown, field: string): string {
    const parsed = text(value, field);
    const milliseconds = Date.parse(parsed);
    if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== parsed) {
        invalid(`Candidate ${field} must be an ISO timestamp`);
    }
    return parsed;
}

export function invalid(message: string): never {
    throw new IntegrationRegistryCandidateError("invalid_candidate", message);
}
