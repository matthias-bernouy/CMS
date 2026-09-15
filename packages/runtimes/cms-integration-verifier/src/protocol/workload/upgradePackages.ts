import { computeIntegrationPackageDigest, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import {
    identifyReviewedSchemaBaseline,
    type AdmissionReviewedBaselineReferenceV1,
    type ReleaseVerificationPlanBaselineV1,
} from "@bernouy/cms-integration-verification";
import type { ExactUpgradePackage } from "../types";

export async function parseExactUpgradePackages(
    value: unknown,
    kind: string,
    references: readonly ReleaseVerificationPlanBaselineV1[],
    reviewedReferences: readonly AdmissionReviewedBaselineReferenceV1[] = [],
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
                const target = { kind, version: reference.version, packageDigest: reference.packageDigest };
                const reviewedSchemaBaselines = await parseReviewedSchemaBaselines(
                    input.reviewedSchemaBaselines,
                    target,
                    reviewedReferences,
                );
                return Object.freeze({
                    ...target,
                    envelope,
                    reviewedSchemaBaselines,
                });
            }),
        ),
    );
}

async function parseReviewedSchemaBaselines(
    value: unknown,
    target: Readonly<{ kind: string; version: string; packageDigest: string }>,
    references: readonly AdmissionReviewedBaselineReferenceV1[],
) {
    if (!Array.isArray(value)) {
        throw new TypeError("Exact upgrade package reviewed schema baselines must be an array");
    }
    const expected = references.filter(
        (entry) =>
            entry.kind === target.kind &&
            entry.version === target.version &&
            entry.packageDigest === target.packageDigest,
    );
    if (value.length !== expected.length) {
        throw new TypeError("Exact reviewed schema baseline transport is incomplete or contains extras");
    }
    const identified = await Promise.all(value.map(identifyReviewedSchemaBaseline));
    return Object.freeze(
        expected.map((reference) => {
            const match = identified.find(
                ({ baseline, digest }) =>
                    baseline.kind === reference.kind &&
                    baseline.version === reference.version &&
                    baseline.packageDigest === reference.packageDigest &&
                    baseline.connectorKey === reference.connectorKey &&
                    baseline.lineageId === reference.lineageId &&
                    baseline.reportId === reference.revisionId &&
                    baseline.observedSchemaDigest === reference.observedSchemaDigest &&
                    digest === reference.baselineDigest,
            );
            if (!match) {
                throw new TypeError("Exact reviewed schema baseline transport substituted a planned baseline");
            }
            return match.baseline;
        }),
    );
}

function strictRecord(
    value: unknown,
): Record<"kind" | "version" | "packageDigest" | "envelope" | "reviewedSchemaBaselines", unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Exact upgrade package transport entry is invalid");
    }
    const fields = ["kind", "version", "packageDigest", "envelope", "reviewedSchemaBaselines"] as const;
    const input = value as Record<string, unknown>;
    if (Object.keys(input).length !== fields.length || !fields.every((field) => Object.hasOwn(input, field))) {
        throw new TypeError("Exact upgrade package transport entry fields are invalid");
    }
    return input as Record<(typeof fields)[number], unknown>;
}
