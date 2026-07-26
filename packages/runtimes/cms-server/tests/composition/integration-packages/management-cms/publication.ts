import {
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    type IntegrationPackageEnvelopeV1,
} from "@bernouy/cms-integration-packages";

export async function candidateDocument(): Promise<string> {
    const packageEnvelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: "remote-demo",
        version: "1.0.0",
        definition: "definition.json",
        releaseNotes: "README.md",
        files: {
            "README.md": { encoding: "utf8", content: "# Remote demo\n" },
            "definition.json": {
                encoding: "utf8",
                content: JSON.stringify({
                    kind: "remote-demo",
                    label: "Remote demo",
                    version: "1.0.0",
                    description: "Submitted through the management CMS",
                    inputs: [],
                }),
            },
        },
    };
    const packageDigest = await computeIntegrationPackageDigest(packageEnvelope);
    return new TextDecoder().decode(
        canonicalJsonBytes({
            schema: "cms.integration.candidate.v1",
            package: packageEnvelope,
            verification: {
                schema: "cms.integration.verification.v1",
                target: { kind: packageEnvelope.kind, version: packageEnvelope.version, packageDigest },
                manifest: {
                    runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
                    contracts: [],
                    conformance: [],
                    fixtures: [],
                },
                files: {},
            },
            submission: { requestedChannel: "latest" },
        }),
    );
}
