import { computeIntegrationPackageDigest, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import type { AdmissionDependencyReferenceV1 } from "@bernouy/cms-integration-verification";
import type { ExactDependencyPackage } from "../types";

export async function parseExactDependencyPackages(
    value: unknown,
    references: readonly AdmissionDependencyReferenceV1[],
): Promise<readonly ExactDependencyPackage[]> {
    if (!Array.isArray(value) || value.length !== references.length) {
        throw new TypeError("Exact dependency package transport is incomplete or contains extras");
    }
    return Object.freeze(
        await Promise.all(
            value.map(async (entry, index) => {
                const input = strictRecord(entry);
                const reference = references[index];
                if (!reference?.selection) {
                    throw new TypeError("Exact dependency package transport references a legacy unselected dependency");
                }
                const envelope = validateIntegrationPackageEnvelope(input.envelope, { requireReleaseNotes: true });
                const packageDigest = await computeIntegrationPackageDigest(envelope);
                if (
                    input.selection !== reference.selection ||
                    input.kind !== reference.kind ||
                    input.version !== reference.version ||
                    input.packageDigest !== reference.packageDigest ||
                    envelope.kind !== reference.kind ||
                    envelope.version !== reference.version ||
                    packageDigest !== reference.packageDigest
                ) {
                    throw new TypeError("Exact dependency package transport substituted an admission reference");
                }
                return Object.freeze({
                    selection: reference.selection,
                    kind: reference.kind,
                    version: reference.version,
                    packageDigest: reference.packageDigest,
                    envelope,
                });
            }),
        ),
    );
}

function strictRecord(
    value: unknown,
): Record<"selection" | "kind" | "version" | "packageDigest" | "envelope", unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Exact dependency package transport entry is invalid");
    }
    const fields = ["selection", "kind", "version", "packageDigest", "envelope"] as const;
    const input = value as Record<string, unknown>;
    if (Object.keys(input).length !== fields.length || !fields.every((field) => Object.hasOwn(input, field))) {
        throw new TypeError("Exact dependency package transport entry fields are invalid");
    }
    return input as Record<(typeof fields)[number], unknown>;
}
