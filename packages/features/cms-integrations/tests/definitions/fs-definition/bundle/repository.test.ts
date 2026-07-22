import { describe, expect, test } from "bun:test";
import { createBundleFixture } from "./fixture";

describe("bundled filesystem definitions", () => {
    test("parses the canonical definition and hides physical bundle directives", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write(
            "definitions/root.json",
            fixture.canonical({
                description: { $include: "description.json" },
                inputs: { $files: ["inputs.json"] },
            }),
        );
        fixture.write("definitions/description.json", "Canonical HTTP payload");
        fixture.write("definitions/inputs.json", { name: "title", label: "Title", type: "text" });

        const definition = await fixture.repository.get("demo");

        expect(definition).toEqual({
            kind: "demo",
            label: "Demo",
            version: "1.0.0",
            description: "Canonical HTTP payload",
            inputs: [{ name: "title", label: "Title", type: "text" }],
        });
        expect(JSON.stringify(definition)).not.toContain("$include");
        expect(JSON.stringify(definition)).not.toContain("$files");
    });

    test("checks index kind and version after bundle resolution", async () => {
        const kind = createBundleFixture();
        kind.bundle();
        kind.write("definitions/root.json", kind.canonical({ kind: "other" }));

        await expect(kind.repository.get("demo")).rejects.toThrow(
            /definition kind "other".*index kind "demo"[\s\S]*definitions\/root\.json#\/kind/,
        );

        const version = createBundleFixture();
        version.bundle();
        version.write("definitions/root.json", version.canonical({ version: "2.0.0" }));

        await expect(version.repository.get("demo")).rejects.toThrow(
            /definition version "2\.0\.0".*"1\.0\.0"[\s\S]*definitions\/root\.json#\/version/,
        );
    });

    test("adds fragment provenance to canonical parse errors", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write("definitions/root.json", fixture.canonical({ inputs: { $files: ["inputs/broken.json"] } }));
        fixture.write("definitions/inputs/broken.json", { name: "broken", type: "text" });

        await expect(fixture.repository.get("demo")).rejects.toThrow(
            /definition\.inputs\.0\.label[\s\S]*definitions\/inputs\/broken\.json#\/label/,
        );
    });

    test("hydrates bundled bloc assets only after parsing", async () => {
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

        const definition = await fixture.repository.get("demo");
        const artifact = definition?.artifacts?.[0];

        expect(artifact?.type).toBe("bloc");
        if (artifact?.type === "bloc") {
            expect(artifact.bloc.viewJS).toContain("customElements.define");
            expect(artifact.bloc.source?.["Bloc.ts"]).toBeTruthy();
        }
    });
});
