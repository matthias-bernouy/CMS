import { deepFreeze } from "cms-repository/exports/contracts/protocol";
import type {
    ProviderManifestChange,
    ProviderManifestChangeCategory,
    ProviderManifestComparison,
} from "cms-repository/providers/manifests/interfaces/ProviderManifestComparison";
import type { AdmittedProviderManifest } from "../admission/admitProviderManifest";
import { verifyProviderManifestAdmission } from "../admission/verifyProviderManifestAdmission";
import {
    DEFAULT_PROVIDER_MANIFEST_LIMITS,
    normalizeProviderManifestLimits,
    type ProviderManifestLimits,
} from "../limits";
import { compareOrdinal } from "../values";
import { compareKeyedValues, compareValues } from "./changes";

/** Reverify artifact structure and integrity; comparison does not re-resolve historical contract references. */
export async function compareProviderManifests(
    previous: AdmittedProviderManifest,
    next: AdmittedProviderManifest,
    limits: Readonly<ProviderManifestLimits> = DEFAULT_PROVIDER_MANIFEST_LIMITS,
): Promise<ProviderManifestComparison> {
    const bounded = normalizeProviderManifestLimits(limits);
    const [before, after] = await Promise.all([
        verifyProviderManifestAdmission(previous, bounded),
        verifyProviderManifestAdmission(next, bounded),
    ]);
    const left = before.manifest;
    const right = after.manifest;
    const changes: ProviderManifestChange[] = [];
    const compare = (
        previousValue: unknown,
        nextValue: unknown,
        path: string,
        category: ProviderManifestChangeCategory,
    ) => compareValues(previousValue, nextValue, path, category, changes);

    compare(left.providerId, right.providerId, "$.providerId", "identity");
    compare(left.provenance.publisherId, right.provenance.publisherId, "$.provenance.publisherId", "identity");
    compare(left.provenance.publishedAt, right.provenance.publishedAt, "$.provenance.publishedAt", "metadata");
    compare(left.version, right.version, "$.version", "metadata");
    compare(left.name, right.name, "$.name", "metadata");
    for (const key of ["website", "setup", "documentation", "support"] as const) {
        compare(left.links?.[key], right.links?.[key], `$.links.${key}`, "metadata");
    }
    compare(left.buildVersionRange, right.buildVersionRange, "$.buildVersionRange", "build_range");
    compare(left.configuration, right.configuration, "$.configuration", "configuration");
    compare(left.recovery, right.recovery, "$.recovery", "recovery_policy");
    compare(
        left.dataPolicy?.retentionPolicyUrl,
        right.dataPolicy?.retentionPolicyUrl,
        "$.dataPolicy.retentionPolicyUrl",
        "data_policy",
    );
    compare(left.endpoint.defaultOrigin, right.endpoint.defaultOrigin, "$.endpoint.defaultOrigin", "endpoint");

    compareKeyedValues(
        left.endpoint.allowedOrigins,
        right.endpoint.allowedOrigins,
        (origin) => origin,
        "$.endpoint.allowedOrigins",
        "endpoint",
        changes,
    );
    compareKeyedValues(
        left.dataPolicy?.residency ?? [],
        right.dataPolicy?.residency ?? [],
        (region) => region,
        "$.dataPolicy.residency",
        "data_policy",
        changes,
    );
    compareKeyedValues(
        left.credentialSlots,
        right.credentialSlots,
        (slot) => slot.id,
        "$.credentialSlots",
        "credential",
        changes,
    );
    compareKeyedValues(
        left.implementations,
        right.implementations,
        (implementation) => `${implementation.contractId}@${implementation.version}`,
        "$.implementations",
        "implementation",
        changes,
        (previousImplementation, nextImplementation, path) => {
            compare(previousImplementation.digest, nextImplementation.digest, `${path}.digest`, "implementation");
            compareKeyedValues(
                previousImplementation.requires,
                nextImplementation.requires,
                (requirement) => `${requirement.contractId}/${requirement.capabilityId}`,
                `${path}.requires`,
                "requirement",
                changes,
            );
        },
    );
    changes.sort((first, second) => compareOrdinal(first.path, second.path) || compareOrdinal(first.kind, second.kind));
    return deepFreeze({
        previousDigest: before.digest,
        nextDigest: after.digest,
        sameIdentity:
            left.providerId === right.providerId && left.provenance.publisherId === right.provenance.publisherId,
        requiresApproval: before.digest !== after.digest,
        changes,
    }) as ProviderManifestComparison;
}
