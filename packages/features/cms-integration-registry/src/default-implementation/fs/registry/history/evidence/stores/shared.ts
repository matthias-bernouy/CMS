import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryCatalogSnapshot } from "../../../../../../interfaces/catalog";
import type { IntegrationMigrationReportLogicalKey } from "../../../../../../interfaces/reportStore";
import type { MigrationReport, VersionDigestReference } from "@bernouy/cms-integration-verification";
import type { FsReleaseVersionKey } from "../types";

export function versionKey(reference: VersionDigestReference): FsReleaseVersionKey {
    return { kind: reference.kind, version: reference.version, packageDigest: reference.packageDigest };
}

export function parseVersionKey(value: unknown): FsReleaseVersionKey {
    const input = exactRecord(value, ["kind", "version", "packageDigest"]);
    if (typeof input.kind !== "string" || typeof input.version !== "string") {
        throw new TypeError("Release report version key has an invalid package identity");
    }
    assertIntegrationPackageKind(input.kind);
    assertIntegrationPackageVersion(input.version);
    return {
        kind: input.kind,
        version: input.version,
        packageDigest: digest(input.packageDigest, "Release report package digest"),
    };
}

export function migrationKey(report: MigrationReport): IntegrationMigrationReportLogicalKey {
    return {
        sourceKind: report.source.kind,
        sourceVersion: report.source.version,
        sourcePackageDigest: report.source.packageDigest,
        targetKind: report.target.kind,
        targetVersion: report.target.version,
        targetPackageDigest: report.target.packageDigest,
        connectorKey: report.connectorKey,
        lineageId: report.lineageId,
        migrationRevision: report.migrationRevision,
    };
}

export function parseMigrationKey(value: unknown): IntegrationMigrationReportLogicalKey {
    const input = exactRecord(value, [
        "sourceKind",
        "sourceVersion",
        "sourcePackageDigest",
        "targetKind",
        "targetVersion",
        "targetPackageDigest",
        "connectorKey",
        "lineageId",
        "migrationRevision",
    ]);
    const source = parseVersionKey({
        kind: input.sourceKind,
        version: input.sourceVersion,
        packageDigest: input.sourcePackageDigest,
    });
    const target = parseVersionKey({
        kind: input.targetKind,
        version: input.targetVersion,
        packageDigest: input.targetPackageDigest,
    });
    if (!stableIdentifier(input.connectorKey) || !stableIdentifier(input.lineageId)) {
        throw new TypeError("Release migration report connector identity is invalid");
    }
    if (!Number.isSafeInteger(input.migrationRevision) || (input.migrationRevision as number) < 1) {
        throw new TypeError("Release migration report revision is invalid");
    }
    return {
        sourceKind: source.kind,
        sourceVersion: source.version,
        sourcePackageDigest: source.packageDigest,
        targetKind: target.kind,
        targetVersion: target.version,
        targetPackageDigest: target.packageDigest,
        connectorKey: input.connectorKey,
        lineageId: input.lineageId,
        migrationRevision: input.migrationRevision as number,
    };
}

export function assertCatalogVersion(snapshot: IntegrationRegistryCatalogSnapshot, key: FsReleaseVersionKey): void {
    const location = snapshot.locateExactVersion(key.kind, key.version);
    if (!location || location.package.digest !== key.packageDigest) {
        throw new Error(`Release report package is not published exactly: ${key.kind}@${key.version}`);
    }
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Release report logical key must be an object");
    }
    const record = value as Record<string, unknown>;
    const actual = Object.keys(record);
    if (actual.length !== keys.length || !keys.every((key) => key in record)) {
        throw new TypeError("Release report logical key has an invalid shape");
    }
    return record;
}

function digest(value: unknown, field: string): string {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
        throw new TypeError(`${field} is invalid`);
    }
    return value;
}

function stableIdentifier(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value);
}
