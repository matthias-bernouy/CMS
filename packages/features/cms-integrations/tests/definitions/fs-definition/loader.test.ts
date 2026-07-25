import { describe, expect, test } from "bun:test";
import { loadIntegrationDefinitionFromVersionRoot } from "@bernouy/cms-integrations/fs";
import { createBundleFixture, type BundleFixture } from "./bundle/fixture";

describe("filesystem integration definition loader", () => {
    test("loads fragmented definitions and hydrates version assets", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write("definitions/root.json", fixture.canonical({ artifacts: { $files: ["blocs/card.json"] } }));
        fixture.write("definitions/blocs/card.json", {
            type: "bloc",
            bloc: { tag: "demo-card", name: "Demo card", path: "blocs/demo-card" },
        });
        fixture.writeText(
            "blocs/demo-card/Bloc.ts",
            "customElements.define('demo-card', class extends HTMLElement {});",
        );
        fixture.write("blocs/demo-card/manifest.json", {});

        const definition = await load(fixture);
        const artifact = definition.artifacts?.[0];

        expect(definition.version).toBe("1.0.0");
        expect(artifact?.type).toBe("bloc");
        if (artifact?.type === "bloc") {
            expect(artifact.bloc.viewJS).toContain("customElements.define");
            expect(artifact.bloc.source?.["Bloc.ts"]).toBeTruthy();
        }
    });

    test("enforces the expected kind and reports fragment provenance", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write("definitions/root.json", fixture.canonical({ kind: "other" }));

        await expect(load(fixture)).rejects.toThrow(
            /definition kind "other".*index kind "demo"[\s\S]*definitions\/root\.json#\/kind/,
        );
    });

    test("requires matching exact SemVer identities before hydration", async () => {
        const malformed = createBundleFixture();
        malformed.bundle();
        malformed.write("definitions/root.json", malformed.canonical({ version: "1.0" }));

        await expect(load(malformed)).rejects.toThrow(
            /definition version "1\.0".*index version "1\.0\.0"[\s\S]*definitions\/root\.json#\/version/,
        );

        const invalidExpectation = createBundleFixture();
        invalidExpectation.bundle();
        invalidExpectation.write("definitions/root.json", invalidExpectation.canonical());

        await expect(load(invalidExpectation, "1.0")).rejects.toThrow("version must be an exact SemVer 2.0 version");
    });
});

async function load(fixture: BundleFixture, expectedVersion = "1.0.0") {
    return await loadIntegrationDefinitionFromVersionRoot({
        definitionPath: "definition.json",
        expectedKind: fixture.kind,
        expectedVersion,
        versionRoot: fixture.versionRoot,
    });
}
