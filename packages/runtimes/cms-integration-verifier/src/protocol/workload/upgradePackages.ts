import { computeIntegrationPackageDigest, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import type { ReleaseVerificationPlanBaselineV1 } from "@bernouy/cms-integration-verification";
import type { ExactUpgradePackage } from "../types";

export async function parseExactUpgradePackages(
    value: unknown,
    kind: string,
    references: readonly ReleaseVerificationPlanBaselineV1[],
): Promise<readonly ExactUpgradePackage[]> {
    if (!Array.isArray(value) || value.length !== references.length) {
        throw new TypeError("Exact upgrade package transport is incomplete or contains extras");
    }
    return Object.freeze(
        await Promise.all(
            value.map(async (entry, index) => {
                const input = strictRecord(entry);
                const reference = references[index]!;
                const envelope = validateIntegrationPackageEnvelope(input.envelope, { requireReleaseNotes: true });
                const packageDigest = await computeIntegrationPackageDigest(envelope);
                if (
                    input.kind !== kind ||
                    input.version !== reference.version ||
                    input.packageDigest !== reference.packageDigest ||
                    envelope.kind !== kind ||
                    envelope.version !== reference.version ||
                    packageDigest !== reference.packageDigest
                ) {
                    throw new TypeError("Exact upgrade package transport substituted a planned baseline");
                }
                return Object.freeze({
                    kind,
                    version: reference.version,
                    packageDigest: reference.packageDigest,
                    envelope,
                });
            }),
        ),
    );
}

function strictRecord(value: unknown): Record<"kind" | "version" | "packageDigest" | "envelope", unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Exact upgrade package transport entry is invalid");
    }
    const fields = ["kind", "version", "packageDigest", "envelope"] as const;
    const input = value as Record<string, unknown>;
    if (Object.keys(input).length !== fields.length || !fields.every((field) => Object.hasOwn(input, field))) {
        throw new TypeError("Exact upgrade package transport entry fields are invalid");
    }
    return input as Record<(typeof fields)[number], unknown>;
}
