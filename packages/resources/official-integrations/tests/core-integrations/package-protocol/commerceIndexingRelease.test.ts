import { describe, expect, test } from "bun:test";
import { IntegrationCompatibilityEvaluator, changedIntegrationPackagePaths } from "@bernouy/cms-integration-registry";
import { projectObservedSchemaContract } from "@bernouy/cms-integrations";
import {
    buildOfficialIntegrationPackages,
    loadOfficialRepositoryBootstrapEvidence,
} from "@bernouy/cms-official-integrations/publication";

describe("official Commerce indexing release", () => {
    test("classifies 1.1.0 as additive while preserving Supabase assets", async () => {
        const packages = await buildOfficialIntegrationPackages();
        const baseline = commercePackage(packages, "1.0.0");
        const candidate = commercePackage(packages, "1.1.0");
        const reviewed = (await loadOfficialRepositoryBootstrapEvidence()).reviewedSchemaBaselines.find(
            ({ kind }) => kind === "commerce",
        );
        if (!reviewed) {
            throw new Error("Commerce reviewed schema baseline is missing");
        }

        const decision = evaluator().evaluate({
            baseline: {
                definition: baseline.definition,
                packageDigest: baseline.digest,
                reviewedSchemaBaselines: [
                    {
                        connector: reviewed.legacySelector,
                        packageDigest: baseline.digest,
                        dependencies: reviewed.dependencies,
                        schema: projectObservedSchemaContract(reviewed.observedSchema),
                        provenance: {
                            evidenceId: reviewed.reportId,
                            source: reviewed.origin,
                            reviewedAt: reviewed.createdAt,
                        },
                    },
                ],
            },
            candidate: { definition: candidate.definition, packageDigest: candidate.digest },
            changedPaths: await changedIntegrationPackagePaths(baseline.package.envelope, candidate.package.envelope),
        });

        expect(decision).toMatchObject({
            outcome: "compatible",
            requiredReleaseLevel: "minor",
            releaseLevel: "minor",
            contractAdmissible: true,
        });
        expect(decision.evidence).toEqual([
            expect.objectContaining({ classification: "additive", code: "source-indexing-added" }),
        ]);
        expect(connectorFiles(candidate)).toEqual(connectorFiles(baseline));
    });
});

function commercePackage(packages: Awaited<ReturnType<typeof buildOfficialIntegrationPackages>>, version: string) {
    const integrationPackage = packages.find(({ kind, version: candidate }) => {
        return kind === "commerce" && candidate === version;
    });
    if (!integrationPackage) {
        throw new Error(`Commerce ${version} package is missing`);
    }
    return integrationPackage;
}

function connectorFiles(integrationPackage: ReturnType<typeof commercePackage>) {
    return Object.fromEntries(
        Object.entries(integrationPackage.package.envelope.files).filter(([path]) => {
            return path.startsWith("connectors/supabase/");
        }),
    );
}

function evaluator(): IntegrationCompatibilityEvaluator {
    return new IntegrationCompatibilityEvaluator({
        identity: { name: "commerce-indexing-release-test", version: "1.0.0" },
        now: () => "2026-08-22T00:00:00.000Z",
        createReportId: () => "commerce-indexing-release-test",
    });
}
