import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { IntegrationRepositoryContractError } from "@bernouy/cms-integrations";

const DIGEST = /^[a-f0-9]{64}$/u;
const encoder = new TextEncoder();

export function strictRecord(
    value: unknown,
    required: readonly string[],
    optional: readonly string[] = [],
): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalid();
    }
    const result = value as Record<string, unknown>;
    const keys = Object.keys(result);
    if (
        !required.every((key) => keys.includes(key)) ||
        keys.some((key) => !required.includes(key) && !optional.includes(key))
    ) {
        invalid();
    }
    return result;
}

export function array(value: unknown, limit: number): readonly unknown[] {
    if (!Array.isArray(value) || value.length > limit) {
        invalid();
    }
    return value;
}

export function text(value: unknown, limit = 16_384): string {
    if (typeof value !== "string" || value.length === 0 || encoder.encode(value).byteLength > limit) {
        invalid();
    }
    return value;
}

export function digest(value: unknown): string {
    const result = text(value, 64);
    if (!DIGEST.test(result)) {
        invalid();
    }
    return result;
}

export function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        invalid();
    }
    return value;
}

export function count(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        invalid();
    }
    return value as number;
}

export function enumText<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
    const result = text(value, 1_024);
    if (!allowed.includes(result as T[number])) {
        invalid();
    }
    return result as T[number];
}

export function identity(kind: unknown, version: unknown): Readonly<{ kind: string; version: string }> {
    try {
        return { kind: assertIntegrationPackageKind(kind), version: assertIntegrationPackageVersion(version) };
    } catch {
        invalid();
    }
}

export function digestIdentity(value: unknown): Readonly<{ kind: string; version: string; packageDigest: string }> {
    const source = strictRecord(value, ["kind", "packageDigest", "version"]);
    return { ...identity(source.kind, source.version), packageDigest: digest(source.packageDigest) };
}

export function policy(
    value: unknown,
    withSnapshot = false,
): Readonly<{ name: string; version: string; snapshotDigest?: string }> {
    const source = strictRecord(value, withSnapshot ? ["name", "snapshotDigest", "version"] : ["name", "version"]);
    return {
        name: text(source.name, 1_024),
        version: text(source.version, 1_024),
        ...(withSnapshot ? { snapshotDigest: digest(source.snapshotDigest) } : {}),
    };
}

export function runner(value: unknown): Readonly<{ name: string; version: string; imageDigest: string }> {
    const source = strictRecord(value, ["imageDigest", "name", "version"]);
    return {
        name: text(source.name, 1_024),
        version: text(source.version, 1_024),
        imageDigest: text(source.imageDigest, 1_024),
    };
}

export function textRecord(value: unknown, limit: number): Readonly<Record<string, string>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        invalid();
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > limit) {
        invalid();
    }
    return Object.fromEntries(entries.map(([name, entry]) => [text(name, 1_024), text(entry, 1_024)]));
}

export function invalid(): never {
    throw new IntegrationRepositoryContractError();
}
