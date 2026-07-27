import { describe, expect, test } from "bun:test";
import { decodeIntegrationPackageFile } from "@bernouy/cms-integration-packages";
import { IntegrationCompatibilityEvaluator, changedIntegrationPackagePaths } from "@bernouy/cms-integration-registry";
import { parseIntegrationCandidateEnvelope } from "@bernouy/cms-integration-verification";
import {
    assertUpgradeEligible,
    projectObservedSchemaContract,
    resolveInstallableIntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import {
    computeSupabaseInstallDigest,
    lintAnonymousConstraints,
    loadSupabaseMigrationAssets,
    loadSupabaseRepeatableAssets,
    loadSupabaseSqlSchemas,
} from "@bernouy/cms-integrations/supabase";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    OFFICIAL_CANDIDATE_RUNNER_REQUIREMENT,
    buildOfficialIntegrationCandidates,
    buildOfficialIntegrationPackages,
    loadOfficialIntegrationVerificationBackfill,
    loadOfficialRepositoryBootstrapEvidence,
    selectOfficialVerificationBackfillPackages,
} from "@bernouy/cms-official-integrations/publication";

const PHOTO_ALBUMS_1_0_0_DIGEST = "6482f865c6fe0302d1b5acda589f2ce20da828ddc228ee65d65d28b7907b9c3e";

describe("official Photo Albums additive release", () => {
    test("keeps the embedded release unverified while building its exact candidate", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const index = await repository.getIndex("photo-albums");
        if (!index) {
            throw new Error("Photo Albums index is missing");
        }
        expect(index.stable).toBe("1.0.0");
        expect(index.latest).toBe("1.0.0");
        expect(index.versions.find(({ version }) => version === "1.1.0")?.status).toBe("unverified");
        expect(resolveInstallableIntegrationDefinitionVersion(index, "1.1.0", "latest")).toBeNull();
        expect(resolveInstallableIntegrationDefinitionVersion(index, undefined, "latest")?.version).toBe("1.0.0");
        expect(() => assertUpgradeEligible(index, "1.1.0")).toThrow(/unverified/);

        const packages = await buildOfficialIntegrationPackages();
        const legacy = packageVersion(packages, "1.0.0");
        const target = packageVersion(packages, "1.1.0");
        expect(legacy.digest).toBe(PHOTO_ALBUMS_1_0_0_DIGEST);
        expect(target.package.envelope.releaseNotes).toBe("release-notes.txt");
        expect(Object.keys(target.package.envelope.files).some((path) => path.startsWith("tests/"))).toBeFalse();
        expect(Object.keys(target.package.envelope.files).some((path) => /\.mdx?$/u.test(path))).toBeFalse();

        const candidate = (await buildOfficialIntegrationCandidates()).find(
            ({ kind, version }) => kind === "photo-albums" && version === "1.1.0",
        );
        if (!candidate) {
            throw new Error("Photo Albums candidate is missing");
        }
        const parsed = await parseIntegrationCandidateEnvelope(candidate.canonicalBytes);
        expect(parsed.packageDigest).toBe(target.digest);
        expect(parsed.verificationDigest).toBe(candidate.verificationDigest);
        expect(parsed.envelope.verification.target).toEqual({
            kind: "photo-albums",
            version: "1.1.0",
            packageDigest: target.digest,
        });
        expect(parsed.envelope.verification.manifest.runnerRequirements).toEqual([
            OFFICIAL_CANDIDATE_RUNNER_REQUIREMENT,
        ]);
        expect(parsed.envelope.verification.manifest.behavioralRls).toBe("platform/behavioral-rls.json");
        expect(parsed.envelope.verification.files["platform/behavioral-rls.json"]?.content).toContain('"probes":[]');

        const backfill = await loadOfficialIntegrationVerificationBackfill();
        const historical = selectOfficialVerificationBackfillPackages(packages, backfill.index);
        expect(historical).toHaveLength(14);
        expect(historical.some(({ kind, version }) => kind === "photo-albums" && version === "1.1.0")).toBeFalse();
    });

    test("classifies the release as minor and rejects additive or breaking changes mislabeled as patches", async () => {
        const packages = await buildOfficialIntegrationPackages();
        const baseline = packageVersion(packages, "1.0.0");
        const candidate = packageVersion(packages, "1.1.0");
        const evidence = await loadOfficialRepositoryBootstrapEvidence();
        const reviewed = evidence.reviewedSchemaBaselines.find(({ kind }) => kind === "photo-albums");
        if (!reviewed) {
            throw new Error("Photo Albums reviewed schema baseline is missing");
        }
        const evaluator = compatibilityEvaluator();
        const baselineInput = {
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
        };
        const changedPaths = await changedIntegrationPackagePaths(
            baseline.package.envelope,
            candidate.package.envelope,
        );
        const accepted = evaluator.evaluateAdmission({
            baseline: baselineInput,
            candidate: { definition: candidate.definition, packageDigest: candidate.digest },
            changedPaths,
        });
        expect(accepted).toMatchObject({
            accepted: true,
            report: { outcome: "compatible", requiredReleaseLevel: "minor", releaseLevel: "minor" },
        });
        expect(accepted.report.evidence).toEqual([
            expect.objectContaining({
                classification: "additive",
                code: "dependency-range-declared-from-reviewed-baseline",
            }),
            expect.objectContaining({ classification: "additive", code: "function-contract-declared" }),
            expect.objectContaining({ classification: "additive", code: "relation-added" }),
        ]);
        expect(accepted.report.evidence.some(({ code }) => code === "legacy-schema-baseline-missing")).toBeFalse();

        const mislabeled = evaluator.evaluateAdmission({
            baseline: baselineInput,
            candidate: { definition: { ...candidate.definition, version: "1.0.1" }, packageDigest: candidate.digest },
            changedPaths,
        });
        expect(mislabeled).toMatchObject({
            accepted: false,
            status: 422,
            report: { requiredReleaseLevel: "minor", releaseLevel: "patch" },
        });

        const reviewedSchema = projectObservedSchemaContract(reviewed.observedSchema);
        const breakingSchema = {
            namespaces: reviewedSchema.namespaces.map((namespace) => ({
                ...namespace,
                relations: namespace.relations.filter(({ name }) => name !== "albums"),
            })),
        };
        const breakingPatch = evaluator.evaluateAdmission({
            baseline: baselineInput,
            candidate: {
                definition: {
                    ...candidate.definition,
                    version: "1.0.1",
                    connectors: candidate.definition.connectors?.map((connector, index) =>
                        index === 0
                            ? { ...connector, compatibility: { ...connector.compatibility, schema: breakingSchema } }
                            : connector,
                    ),
                },
                packageDigest: candidate.digest,
            },
            changedPaths,
        });
        expect(breakingPatch).toMatchObject({
            accepted: false,
            status: 422,
            report: { requiredReleaseLevel: "major", releaseLevel: "patch" },
        });
        expect(breakingPatch.report.evidence).toContainEqual(
            expect.objectContaining({ classification: "breaking", code: "relation-removed" }),
        );
    });

    test("binds executable install, migration, repeatable, and constraint assets", async () => {
        const packages = await buildOfficialIntegrationPackages();
        const source = packageVersion(packages, "1.0.0");
        const target = packageVersion(packages, "1.1.0");
        const connector = target.definition.connectors?.[0];
        const location = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).locateExactVersion(
            "photo-albums",
            "1.1.0",
        );
        if (!connector?.migration || !location) {
            throw new Error("Photo Albums migration-aware connector is missing");
        }
        const connectorRoot = `${location.root}/${connector.root}`;
        const schemas = await loadSupabaseSqlSchemas(connectorRoot, connector.schemas ?? []);
        expect(await computeSupabaseInstallDigest(schemas)).toBe(connector.migration.install.digest);
        const legacy = connector.migration.supportedSources[0]?.legacyAdoption;
        const sourceLocation = await new FsIntegrationDefinitionRepository(
            OFFICIAL_INTEGRATIONS_ROOT,
        ).locateExactVersion("photo-albums", "1.0.0");
        const sourceConnector = source.definition.connectors?.[0];
        if (!legacy || !sourceLocation || !sourceConnector) {
            throw new Error("Photo Albums legacy source mapping is missing");
        }
        const sourceSchemas = await loadSupabaseSqlSchemas(
            `${sourceLocation.root}/${sourceConnector.root}`,
            sourceConnector.schemas ?? [],
        );
        expect(await computeSupabaseInstallDigest(sourceSchemas)).toBe(legacy.installDigest);
        expect(await loadSupabaseMigrationAssets(connectorRoot, connector.migration.migrations)).toHaveLength(1);
        expect(await loadSupabaseRepeatableAssets(connectorRoot, connector.migration.repeatables ?? [])).toHaveLength(
            2,
        );

        const findings = Object.entries(target.package.envelope.files).flatMap(([path, file]) =>
            path.endsWith(".sql")
                ? lintAnonymousConstraints(new TextDecoder().decode(decodeIntegrationPackageFile(file)), path)
                : [],
        );
        expect(findings).toEqual([]);
    });
});

function packageVersion(packages: Awaited<ReturnType<typeof buildOfficialIntegrationPackages>>, version: string) {
    const integrationPackage = packages.find(
        (candidate) => candidate.kind === "photo-albums" && candidate.version === version,
    );
    if (!integrationPackage) {
        throw new Error(`Photo Albums ${version} package is missing`);
    }
    return integrationPackage;
}

function compatibilityEvaluator(): IntegrationCompatibilityEvaluator {
    let sequence = 0;
    return new IntegrationCompatibilityEvaluator({
        identity: { name: "official-release-test", version: "1.0.0" },
        now: () => "2026-07-27T00:00:00.000Z",
        createReportId: () => `official-release-test-${++sequence}`,
    });
}
