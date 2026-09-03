import {
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    type IntegrationPackageEnvelopeV1,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import { loadIntegrationDefinitionFromVersionRoot } from "@bernouy/cms-integrations/fs";
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
        input.workload.upgradePackages.map(async (entry) => await releasePackage(entry.envelope, entry.packageDigest)),
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
        return { package: resolved, definition, ...(verification ? { verification } : {}) };
    } finally {
        await materializer.dispose();
    }
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
