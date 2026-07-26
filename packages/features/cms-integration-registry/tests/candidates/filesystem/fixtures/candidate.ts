import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import {
    validateIntegrationCandidateEnvelope,
    type ValidatedIntegrationCandidateEnvelopeV1,
} from "@bernouy/cms-integration-verification";

export async function candidateValue(): Promise<ValidatedIntegrationCandidateEnvelopeV1> {
    const packageEnvelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: "example",
        version: "1.2.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: "{}" },
            "release-notes.md": { encoding: "utf8", content: "Release" },
        },
    };
    const packageDigest = await computeIntegrationPackageDigest(packageEnvelope);
    return await validateIntegrationCandidateEnvelope({
        schema: "cms.integration.candidate.v1",
        package: packageEnvelope,
        verification: {
            schema: "cms.integration.verification.v1",
            target: { kind: "example", version: "1.2.0", packageDigest },
            manifest: {
                runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
                contracts: [],
                conformance: [],
                fixtures: [],
            },
            files: {},
        },
        submission: { requestedChannel: "latest" },
    });
}
