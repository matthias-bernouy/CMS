import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    validateIntegrationCandidateEnvelope,
    validateIntegrationVerificationEnvelope,
    type IntegrationCandidateEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import { OFFICIAL_INTEGRATIONS_ROOT } from "../../../index";
import { buildOfficialIntegrationPackages } from "../runtime";

export const OFFICIAL_CANDIDATE_RUNNER_REQUIREMENT = Object.freeze({
    name: "cms-postgres",
    versionRange: "1.0.0",
});

export type BuiltOfficialIntegrationCandidate = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
    candidateDigest: string;
    canonicalBytes: Uint8Array;
}>;

export async function buildOfficialIntegrationCandidates(
    requestedRoot: string = OFFICIAL_INTEGRATIONS_ROOT,
): Promise<readonly BuiltOfficialIntegrationCandidate[]> {
    const packages = await buildOfficialIntegrationPackages(requestedRoot);
    return await Promise.all(
        packages.map(async (integrationPackage) => {
            const verification = validateIntegrationVerificationEnvelope({
                schema: "cms.integration.verification.v1",
                target: {
                    kind: integrationPackage.kind,
                    version: integrationPackage.version,
                    packageDigest: integrationPackage.digest,
                },
                manifest: {
                    runnerRequirements: [OFFICIAL_CANDIDATE_RUNNER_REQUIREMENT],
                    contracts: [],
                    conformance: [],
                    fixtures: [],
                },
                files: {},
            });
            const validated = await validateIntegrationCandidateEnvelope({
                schema: "cms.integration.candidate.v1",
                package: integrationPackage.package.envelope,
                verification,
                submission: { requestedChannel: "latest" },
            } satisfies IntegrationCandidateEnvelopeV1);
            return Object.freeze({
                kind: integrationPackage.kind,
                version: integrationPackage.version,
                packageDigest: validated.packageDigest,
                verificationDigest: validated.verificationDigest,
                candidateDigest: validated.candidateDigest,
                canonicalBytes: canonicalJsonBytes(validated.envelope),
            });
        }),
    );
}
