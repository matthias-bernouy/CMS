import { describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../../src/cli";
import { LocalIntegrationRepository } from "../../src/repository/local";
import { resolveRequiredPackages } from "../../src/release/packages";
import { readLocalReleaseSource } from "../../src/release/source";
import { writeDirectIntegrationSource } from "../fixtures";
import { emptyRemote, releasePackage, temporaryRoot } from "./support";

describe("local release source", () => {
    test("packages a direct source tree from a workspace containing unrelated symlinks", async () => {
        const root = await temporaryRoot();
        const source = join(root, "source");
        const definitionPath = await writeDirectIntegrationSource(source);
        await writeFile(
            definitionPath,
            JSON.stringify({
                schema: "cms.integration.definition.v2",
                type: "source",
                kind: "demo",
                label: "Demo",
                version: "2.0.0",
                inputs: [],
            }),
        );
        const integrationRoot = join(source, "integrations", "demo");
        await mkdir(join(integrationRoot, "definitions", "artifacts", "dashboards"), { recursive: true });
        await mkdir(join(integrationRoot, "assets", "dashboards"), { recursive: true });
        await writeFile(join(integrationRoot, "definitions", "artifacts", "dashboards", "admin.json"), "{}\n");
        await writeFile(join(integrationRoot, "assets", "dashboards", "admin.svg"), "<svg></svg>\n");
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

        expect(files).toEqual([
            "assets/dashboards/admin.svg",
            "definition.json",
            "definitions/artifacts/dashboards/admin.json",
            "release-notes.txt",
        ]);
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

    test("loads collections required by selectable resources", async () => {
        const root = await temporaryRoot();
        const repositoryRoot = join(root, "repository");
        await mkdir(repositoryRoot, { recursive: true });
        const repository = new LocalIntegrationRepository(repositoryRoot, join(repositoryRoot, "packages"));
        await repository.init();
        const ulvia = await releasePackage("2.1.0", {}, "ulvia");
        await repository.store({ ...ulvia, source: "local:/ulvia" });
        const mossa = await releasePackage(
            "1.0.0",
            {
                schema: "cms.integration.definition.v2",
                type: "collection",
                resourceCategories: [{ id: "content", label: "Content" }],
                resources: [
                    {
                        id: "mossa/blocs/card",
                        type: "bloc",
                        artifact: "card",
                        category: "content",
                        requires: {
                            collections: [{ kind: "ulvia", versionRange: "^2.1.0", resources: ["ulvia/blocs/button"] }],
                        },
                    },
                ],
                artifacts: [{ type: "bloc", bloc: { tag: "card", name: "Card", compositionHTML: "<p></p>" } }],
            },
            "mossa",
        );

        const dependencies = await resolveRequiredPackages([mossa], repository);

        expect(dependencies.map(({ definition }) => `${definition.kind}@${definition.version}`)).toEqual([
            "ulvia@2.1.0",
        ]);
    });
});
