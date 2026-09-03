import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { identifyObservedSchemaContract } from "@bernouy/cms-integrations";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../../src/cli";
import { readLocalReleaseSource } from "../../src/release/source";
import { writeDirectIntegrationSource } from "../fixtures";
import { emptyRemote, temporaryRoot } from "./support";

describe("local release source", () => {
    test("packages a direct source tree from a workspace containing unrelated symlinks", async () => {
        const root = await temporaryRoot();
        const source = join(root, "source");
        await writeDirectIntegrationSource(source);
        await symlink(root, join(source, "workspace-link"), "dir");
        let files: readonly string[] = [];

        await runCli(["audit", "demo"], {
            environment: { ULVIA_DATA_DIR: join(root, "data") },
            cwd: source,
            repositoryFetch: emptyRemote,
            releaseVerifier: {
                verify: async ({ candidate }) => {
                    files = Object.keys(candidate.package.envelope.files);
                },
            },
            log: () => undefined,
        });

        expect(files).toEqual(["definition.json", "release-notes.txt"]);
    });

    test("builds a digest-bound portable upgrade fixture bundle outside runtime bytes", async () => {
        const root = await temporaryRoot();
        const source = join(root, "source");
        await writeDirectIntegrationSource(source);
        const fixtureRoot = join(source, "integrations", "demo", "tests", "integration-contracts");
        await mkdir(fixtureRoot, { recursive: true });
        await writeFile(
            join(fixtureRoot, "upgrade-fixtures.ts"),
            `import { defineUpgradeScenarios } from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
             import { expect } from "@bernouy/cms-integration-verification/sdk/v1";
             import { value } from "./value.ts";
             expect(value).toBe(1);
             export default defineUpgradeScenarios({
                 schema: "ulvia.upgrade-fixtures.v1",
                 scenarios: [{
                     name: "preserves data",
                     from: "^1.0.0",
                     dependencies: [{ kind: "dependency", versionRange: "^2.0.0" }],
                     seedBeforeUpgrade() { return { value }; },
                     assertAfterUpgrade(_context, state) { expect(state.value).toBe(1); },
                 }],
             });`,
        );
        await writeFile(join(fixtureRoot, "value.ts"), "export const value = 1;\n");
        await writeFile(join(fixtureRoot, "unrelated.test.ts"), "throw new Error('not portable');\n");

        const loaded = await readLocalReleaseSource(source, "demo");

        expect(loaded.verification.envelope.target).toEqual({
            kind: "demo",
            version: "2.0.0",
            packageDigest: loaded.package.digest,
        });
        expect(loaded.verification.envelope.manifest.upgradeFixture).toEqual({
            entrypoint: "upgrade/upgrade-fixtures.ts",
            scenarios: [
                {
                    name: "preserves data",
                    from: "^1.0.0",
                    dependencies: [{ kind: "dependency", versionRange: "^2.0.0" }],
                },
            ],
        });
        expect(Object.keys(loaded.verification.envelope.files)).toEqual([
            "upgrade/upgrade-fixtures.ts",
            "upgrade/value.ts",
        ]);
        expect(Object.keys(loaded.package.envelope.files)).not.toContain(
            "tests/integration-contracts/upgrade-fixtures.ts",
        );
    });

    test("loads canonical digest-bound reviewed schema evidence from the nearest registry", async () => {
        const root = await temporaryRoot();
        const source = join(root, "source");
        await writeDirectIntegrationSource(source, "1.0.0");
        const initial = await readLocalReleaseSource(source, "demo");
        const observedSchema = {
            schema: "cms.integration.observed-schema.v1",
            owner: { connectorKey: "primary", lineageId: "demo-supabase-v1" },
            namespaces: [{ name: "public", relations: [] }],
        } as const;
        const digest = "a".repeat(64);
        const createdAt = "2026-07-26T12:00:00.000Z";
        const registry = join(source, ".registry");
        await mkdir(registry);
        await writeFile(
            join(registry, "official-bootstrap-evidence.v1.json"),
            canonicalJsonBytes({
                schema: "cms.integration.official-bootstrap-evidence.v1",
                reviewedSchemaBaselines: [
                    {
                        schema: "cms.integration.reviewed-schema-baseline.v1",
                        reportId: "demo-baseline",
                        revisionType: "root",
                        origin: "legacy-backfill",
                        createdAt,
                        kind: "demo",
                        version: "1.0.0",
                        packageDigest: initial.package.digest,
                        connectorKey: "primary",
                        lineageId: "demo-supabase-v1",
                        legacySelector: { provider: "supabase", root: "connectors/supabase" },
                        dependencies: [],
                        observedSchema,
                        observedSchemaDigest: (await identifyObservedSchemaContract(observedSchema)).digest,
                        generator: { name: "cms-postgres", version: "1.0.0", imageDigest: `sha256:${digest}` },
                        environment: { digest, postgresVersion: "16.4" },
                        policy: { name: "legacy-schema-baseline", version: "1.0.0" },
                        generatedAt: createdAt,
                        provenance: { actor: "repository-ci", reason: "reviewed baseline", evidenceIds: [digest] },
                    },
                ],
                anonymousConstraintGrandfathering: [],
            }),
        );

        const loaded = await readLocalReleaseSource(source, "demo");

        expect(loaded.reviewedSchemaEvidence).toHaveLength(1);
        expect(loaded.reviewedSchemaEvidence[0]).toMatchObject({
            kind: "demo",
            version: "1.0.0",
            packageDigest: initial.package.digest,
            baseline: { connector: { provider: "supabase", root: "connectors/supabase" } },
        });
    });
});
