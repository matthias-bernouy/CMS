import { assertIntegrationPackagePath } from "@bernouy/cms-integration-packages";
import { isExactIntegrationVersion } from "../../../definitions/versioning";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import type { IntegrationMigrationChecksum } from "../../../../interfaces/IntegrationConnectorDeployer";
import { isRecord, text } from "../../definition/values";

const stableId = /^[a-z][a-z0-9-]{0,127}$/;
const checksum = /^sha256:[a-f0-9]{64}$/;
const packageDigest = /^[a-f0-9]{64}$/;

export function parseMigrationId(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed) {
        throw new MissingIntegrationParam(name);
    }
    assertStableMigrationId(parsed, name);
    return parsed;
}

export function assertStableMigrationId(value: string, name: string): void {
    if (!stableId.test(value)) {
        invalidMigrationValue(name, "must be a stable lowercase identifier");
    }
}

export function parseMigrationChecksum(value: unknown, name: string): IntegrationMigrationChecksum {
    const parsed = text(value);
    if (!parsed || !checksum.test(parsed)) {
        invalidMigrationValue(name, "must be a lowercase sha256 checksum");
    }
    return parsed as IntegrationMigrationChecksum;
}

export function parseMigrationPackageDigest(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed || !packageDigest.test(parsed)) {
        invalidMigrationValue(name, "must be a lowercase SHA-256 package digest");
    }
    return parsed;
}

export function parseMigrationPackagePath(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed) {
        throw new MissingIntegrationParam(name);
    }
    try {
        assertIntegrationPackagePath(parsed);
    } catch {
        invalidMigrationValue(name, "must be a safe canonical package path");
    }
    return parsed;
}

export function assertMigrationLayoutPath(value: string, prefix: string, name: string): void {
    if (!value.startsWith(prefix)) {
        invalidMigrationValue(name, `must be inside ${prefix}`);
    }
}

export function parseMigrationRevision(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        invalidMigrationValue(name, "must be a non-negative safe integer");
    }
    return value as number;
}

export function parseMigrationDuration(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 604_800) {
        invalidMigrationValue(name, "must be an integer between 0 and 604800 seconds");
    }
    return value as number;
}

export function parseMigrationVersion(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed || !isExactIntegrationVersion(parsed)) {
        invalidMigrationValue(name, "must be an exact SemVer version");
    }
    return parsed;
}

export function migrationArray(value: unknown, name: string): unknown[] {
    if (!Array.isArray(value)) {
        invalidMigrationValue(name, "must be an array");
    }
    return value;
}

export function migrationRecord(value: unknown, name: string): Record<string, unknown> {
    if (!isRecord(value)) {
        invalidMigrationValue(name, "must be an object");
    }
    return value;
}

export function assertMigrationKeys(value: Record<string, unknown>, allowed: string[], name: string): void {
    const unknown = Object.keys(value).find((key) => !allowed.includes(key));
    if (unknown) {
        invalidMigrationValue(`${name}.${unknown}`, "is not supported");
    }
}

export function assertRequiredMigrationKeys(
    value: Record<string, unknown>,
    required: string[],
    name: string,
    optional: string[] = [],
): void {
    assertMigrationKeys(value, [...required, ...optional], name);
    for (const key of required) {
        if (value[key] === undefined) {
            throw new MissingIntegrationParam(`${name}.${key}`);
        }
    }
}

export function invalidMigrationValue(name: string, message: string): never {
    throw new IntegrationInputError(name, message);
}
