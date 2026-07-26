import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { isIntegrationPrerelease } from "@bernouy/cms-integrations";
import { immutableClone } from "../../../../core/catalog/immutability";
import type { IntegrationRegistryStablePromotionRecord } from "../../../../interfaces/promotion";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../persistence/canonicalFile";

export const MAX_INTEGRATION_REGISTRY_STABLE_PROMOTION_RECORD_BYTES = 64 * 1_024;

export async function readStablePromotionRecord(
    path: string,
): Promise<IntegrationRegistryStablePromotionRecord | null> {
    const value = await readCanonicalJsonFile(path, MAX_INTEGRATION_REGISTRY_STABLE_PROMOTION_RECORD_BYTES);
    return value === null ? null : parseStablePromotionRecord(value);
}

export async function writeStablePromotionRecord(
    path: string,
    record: IntegrationRegistryStablePromotionRecord,
): Promise<void> {
    await writeCanonicalJsonNoReplace(
        path,
        parseStablePromotionRecord(record),
        MAX_INTEGRATION_REGISTRY_STABLE_PROMOTION_RECORD_BYTES,
    );
}

export function parseStablePromotionRecord(value: unknown): IntegrationRegistryStablePromotionRecord {
    const schema = isRecord(value) ? value.schema : undefined;
    const isComposite = schema === "cms.integration.registry.stable-promotion.v2";
    if (
        !isRecord(value) ||
        !hasAllowedKeys(
            value,
            [
                "actor",
                "confirmation",
                "createdAt",
                "id",
                "kind",
                "operationId",
                "packageDigest",
                "reportRevisionId",
                "schema",
                "version",
            ],
            ["previousStable", "reason", ...(isComposite ? ["reportDigest", "reportType"] : [])],
        ) ||
        (schema !== "cms.integration.registry.stable-promotion.v1" && !isComposite) ||
        !isConfirmation(value.confirmation) ||
        !isPathSafeId(value.id) ||
        !isPathSafeId(value.operationId) ||
        !isBoundedCanonicalText(value.actor, 512) ||
        !isBoundedCanonicalText(value.reportRevisionId, 512) ||
        !isBoundedCanonicalText(value.kind, 128) ||
        !isBoundedCanonicalText(value.version, 128) ||
        !isDigest(value.packageDigest) ||
        (isComposite && (!isDigest(value.reportDigest) || value.reportType !== "release-admission-decision")) ||
        !isTimestamp(value.createdAt) ||
        (value.reason !== undefined && !isBoundedCanonicalText(value.reason, 4_096)) ||
        (value.previousStable !== undefined && !isBoundedCanonicalText(value.previousStable, 128))
    ) {
        throw new Error("Invalid integration registry stable promotion record");
    }
    assertIntegrationPackageKind(value.kind);
    assertIntegrationPackageVersion(value.version);
    if (isIntegrationPrerelease(value.version)) {
        throw new Error("Integration registry stable promotion cannot target a prerelease");
    }
    if (value.previousStable !== undefined) {
        assertIntegrationPackageVersion(value.previousStable);
        if (isIntegrationPrerelease(value.previousStable)) {
            throw new Error("Integration registry previous stable version cannot be a prerelease");
        }
    }
    if (
        value.confirmation.version !== value.version ||
        value.confirmation.reportRevisionId !== value.reportRevisionId
    ) {
        throw new Error("Integration registry stable promotion confirmation does not match its target");
    }
    return immutableClone(value as unknown as IntegrationRegistryStablePromotionRecord);
}

function hasAllowedKeys(
    value: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[],
): boolean {
    const keys = Object.keys(value);
    return (
        required.every((key) => keys.includes(key)) &&
        keys.every((key) => required.includes(key) || optional.includes(key))
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPathSafeId(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function isBoundedCanonicalText(value: unknown, maxLength: number): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= maxLength && value.trim() === value;
}

function isDigest(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isTimestamp(value: unknown): value is string {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isConfirmation(value: unknown): value is IntegrationRegistryStablePromotionRecord["confirmation"] {
    return (
        isRecord(value) &&
        Object.keys(value).length === 2 &&
        "version" in value &&
        "reportRevisionId" in value &&
        isBoundedCanonicalText(value.version, 128) &&
        isBoundedCanonicalText(value.reportRevisionId, 512)
    );
}
