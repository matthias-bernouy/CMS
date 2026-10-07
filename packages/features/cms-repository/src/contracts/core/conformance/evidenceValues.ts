import type { ReleaseDigest } from "cms-repository/contracts/core/admission/digest";

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function evidenceArray<T>(
    value: unknown,
    minimum: number,
    maximum: number,
    parse: (item: unknown) => T,
): readonly T[] {
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
        fail("Conformance evidence array is outside its bounds");
    }
    return Object.freeze(value.map(parse));
}

export function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail("Conformance evidence object expected");
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => !keys.includes(key))) {
        fail("Conformance evidence contains an unknown field");
    }
    return record;
}

export function identifier(value: unknown, label: string): string {
    return text(value, label, IDENTIFIER, 128);
}

export function text(value: unknown, label: string, pattern?: RegExp, maximum = 4_096): string {
    if (typeof value !== "string" || !value || value.length > maximum || (pattern && !pattern.test(value))) {
        fail(`Invalid ${label}`);
    }
    return value;
}

export function digest(value: unknown, label: string): ReleaseDigest {
    return text(value, label, DIGEST, 71) as ReleaseDigest;
}

export function integer(value: unknown, minimum: number, maximum: number, label: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
        fail(`Invalid ${label}`);
    }
    return value as number;
}

export function duration(value: unknown): number {
    return integer(value, 0, 86_400_000, "durationMs");
}

export function dateTime(value: unknown, label: string): string {
    const parsed = text(value, label, undefined, 40);
    if (!Number.isFinite(Date.parse(parsed))) {
        fail(`Invalid ${label}`);
    }
    return parsed;
}

export function runStatus(value: unknown): "passed" | "failed" {
    if (value !== "passed" && value !== "failed") {
        fail("Invalid conformance evidence status");
    }
    return value;
}

export function fail(message: string): never {
    throw new TypeError(message);
}
