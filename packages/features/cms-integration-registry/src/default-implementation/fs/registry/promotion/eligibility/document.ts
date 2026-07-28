import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryVersionEligibilityRecord } from "../../../../../interfaces/promotion";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../../persistence/canonicalFile";

export const INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_RECORD_SCHEMA =
    "cms.integration.registry.version-eligibility.v1" as const;
export const MAX_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export async function writeVersionEligibilityRecord(
    path: string,
    record: IntegrationRegistryVersionEligibilityRecord,
): Promise<void> {
    await writeCanonicalJsonNoReplace(
        path,
        parseVersionEligibilityRecord(record),
        MAX_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_DOCUMENT_BYTES,
    );
}

export async function readVersionEligibilityRecord(
    path: string,
): Promise<IntegrationRegistryVersionEligibilityRecord | null> {
    const value = await readCanonicalJsonFile(path, MAX_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_DOCUMENT_BYTES);
    return value === null ? null : parseVersionEligibilityRecord(value);
}

export function parseVersionEligibilityRecord(value: unknown): IntegrationRegistryVersionEligibilityRecord {
    if (!isRecord(value) || !hasExpectedKeys(value)) {
        throw new Error("Invalid integration registry version eligibility record shape");
    }
    const action = value.action;
    const nextStatus = value.nextStatus;
    if (
        value.schema !== INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_RECORD_SCHEMA ||
        (action !== "block" && action !== "mark-inadmissible") ||
        nextStatus !== (action === "block" ? "blocked" : "inadmissible") ||
        !isPathSafeId(value.id) ||
        !isPathSafeId(value.operationId) ||
        !isSha256(value.packageDigest) ||
        !isDecision(value.decision) ||
        !isStatusOrUndefined(value.previousStatus) ||
        !isChannels(value.previousChannels) ||
        !isChannels(value.nextChannels) ||
        !isProvenance(value.provenance) ||
        typeof value.createdAt !== "string" ||
        !Number.isFinite(Date.parse(value.createdAt))
    ) {
        throw new Error("Invalid integration registry version eligibility record");
    }
    assertIntegrationPackageKind(requiredText(value.kind, "kind"));
    assertIntegrationPackageVersion(requiredText(value.version, "version"));
    if (action === "block" ? !isConfirmation(value.confirmation, value) : value.confirmation !== undefined) {
        throw new Error("Integration registry version eligibility confirmation is inconsistent");
    }
    return value as IntegrationRegistryVersionEligibilityRecord;
}

function hasExpectedKeys(value: Record<string, unknown>): boolean {
    const required = [
        "action",
        "createdAt",
        "decision",
        "id",
        "kind",
        "nextChannels",
        "nextStatus",
        "operationId",
        "packageDigest",
        "previousChannels",
        "provenance",
        "schema",
        "version",
    ];
    const optional = ["confirmation", "previousStatus"];
    const keys = Object.keys(value);
    return (
        required.every((key) => keys.includes(key)) &&
        keys.every((key) => required.includes(key) || optional.includes(key))
    );
}

function isConfirmation(value: unknown, record: Record<string, unknown>): boolean {
    return (
        isRecord(value) &&
        hasExactKeys(value, ["action", "decisionDigest", "decisionRevisionId", "kind", "version"]) &&
        value.action === "block" &&
        value.kind === record.kind &&
        value.version === record.version &&
        isRecord(record.decision) &&
        value.decisionRevisionId === record.decision.revisionId &&
        value.decisionDigest === record.decision.digest
    );
}

function isDecision(value: unknown): boolean {
    return (
        isRecord(value) &&
        hasExactKeys(value, ["digest", "revisionId"]) &&
        isSha256(value.digest) &&
        isBoundedText(value.revisionId, 512)
    );
}

function isChannels(value: unknown): boolean {
    if (!isRecord(value) || Object.keys(value).some((key) => key !== "latest" && key !== "stable")) {
        return false;
    }
    try {
        if (value.latest !== undefined) {
            assertIntegrationPackageVersion(requiredText(value.latest, "latest"));
        }
        if (value.stable !== undefined) {
            assertIntegrationPackageVersion(requiredText(value.stable, "stable"));
        }
        return true;
    } catch {
        return false;
    }
}

function isProvenance(value: unknown): boolean {
    return (
        isRecord(value) &&
        hasExactKeys(value, ["actor", "reason"]) &&
        isBoundedText(value.actor, 512) &&
        isBoundedText(value.reason, 4_096)
    );
}

function isStatusOrUndefined(value: unknown): boolean {
    return value === undefined || value === "blocked" || value === "inadmissible" || value === "unverified";
}

function requiredText(value: unknown, label: string): string {
    if (!isText(value)) {
        throw new Error(`Version eligibility ${label} is required`);
    }
    return value;
}

function isText(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isBoundedText(value: unknown, maxLength: number): value is string {
    return isText(value) && value.length <= maxLength;
}

function isSha256(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isPathSafeId(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
