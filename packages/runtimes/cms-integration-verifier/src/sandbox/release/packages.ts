import {
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    type IntegrationPackageEnvelopeV1,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import type { ReviewedConnectorSchemaBaseline } from "@bernouy/cms-integration-registry";
import { identifyReviewedSchemaBaseline, type ReviewedSchemaBaselineV1 } from "@bernouy/cms-integration-verification";
import { loadIntegrationDefinitionFromVersionRoot } from "@bernouy/cms-integrations/fs";
import { projectObservedSchemaContract } from "@bernouy/cms-integrations";
import type { LocalReleasePackage } from "@bernouy/ulvia-cli/release-runtime";
import type { VerificationSandboxInput } from "../../supervisor";
import { createBoundedPackageMaterializer } from "../service/materialization";

export async function loadExactReleaseRuntimePackages(input: VerificationSandboxInput): Promise<
    Readonly<{
        candidate: LocalReleasePackage;
        baselines: readonly LocalReleasePackage[];
        availablePackages: readonly LocalReleasePackage[];
    }>
> {
    const candidate = await releasePackage(
        input.workload.package,
        input.workload.admission.candidate.packageDigest,
        verificationBundle(input),
    );
    const baselines = await Promise.all(
        input.workload.upgradePackages.map(
            async (entry) =>
                await releasePackage(entry.envelope, entry.packageDigest, undefined, entry.reviewedSchemaBaselines),
        ),
    );
    const availablePackages = await Promise.all(
        input.workload.dependencyPackages.map(
            async (entry) => await releasePackage(entry.envelope, entry.packageDigest),
        ),
    );
    return { candidate, baselines, availablePackages };
}

function verificationBundle(input: VerificationSandboxInput): NonNullable<LocalReleasePackage["verification"]> {
    return {
        envelope: input.workload.verification,
        canonicalBytes: canonicalJsonBytes(input.workload.verification),
        digest: input.workload.admission.candidate.verificationDigest,
    };
}

async function releasePackage(
    envelope: IntegrationPackageEnvelopeV1,
    expectedDigest: string,
    verification?: NonNullable<LocalReleasePackage["verification"]>,
    reviewedSchemaBaselines: readonly ReviewedSchemaBaselineV1[] = [],
): Promise<LocalReleasePackage> {
    const resolved = await exactPackage(envelope, expectedDigest);
    const materializer = createBoundedPackageMaterializer({ maxCachedPackages: 1 });
    try {
        const root = await materializer.root(envelope);
        const definition = await loadIntegrationDefinitionFromVersionRoot({
            definitionPath: envelope.definition,
            expectedKind: envelope.kind,
            expectedVersion: envelope.version,
            versionRoot: root,
        });
        const reviewed = await Promise.all(reviewedSchemaBaselines.map(projectReviewedSchemaBaseline));
        return {
            package: resolved,
            definition,
            ...(verification ? { verification } : {}),
            ...(reviewed.length > 0 ? { reviewedSchemaBaselines: reviewed } : {}),
        };
    } finally {
        await materializer.dispose();
    }
}

async function projectReviewedSchemaBaseline(
    value: ReviewedSchemaBaselineV1,
): Promise<ReviewedConnectorSchemaBaseline> {
    const identified = await identifyReviewedSchemaBaseline(value);
    const baseline = identified.baseline;
    return Object.freeze({
        connector: Object.freeze({ ...baseline.legacySelector }),
        packageDigest: baseline.packageDigest,
        dependencies: Object.freeze(baseline.dependencies.map((dependency) => Object.freeze({ ...dependency }))),
        schema: projectObservedSchemaContract(baseline.observedSchema),
        provenance: Object.freeze({
            evidenceId: `reviewed-schema-baseline-${identified.digest}`,
            source: `${baseline.origin}:${baseline.policy.name}@${baseline.policy.version}`,
            reviewedAt: baseline.createdAt,
        }),
    });
}

async function exactPackage(
    envelope: IntegrationPackageEnvelopeV1,
    expectedDigest: string,
): Promise<ResolvedIntegrationPackage> {
    const digest = await computeIntegrationPackageDigest(envelope);
    if (digest !== expectedDigest) {
        throw new TypeError(`Release runtime package ${envelope.kind}@${envelope.version} has an invalid digest`);
    }
    return { envelope, digest, canonicalBytes: canonicalJsonBytes(envelope) };
}
