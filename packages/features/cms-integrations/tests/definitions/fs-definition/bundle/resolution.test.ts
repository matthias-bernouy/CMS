import { describe, expect, test } from "bun:test";
import { resolveIntegrationDefinitionFile } from "@bernouy/cms-integrations/fs";
import { createBundleFixture } from "./fixture";

describe("filesystem integration definition bundles", () => {
    test("keeps monolithic V1 definitions unchanged", async () => {
        const fixture = createBundleFixture();
        const definition = fixture.canonical({ description: "Legacy" });
        fixture.write("definition.json", definition);

        expect(await resolveIntegrationDefinitionFile(fixture.definitionPath, fixture.versionRoot)).toEqual(definition);
    });

    test("resolves a simple V2 bundle root", async () => {
        const fixture = createBundleFixture();
        const definition = fixture.canonical();
        fixture.bundle();
        fixture.write("definitions/root.json", definition);

        expect(await resolveIntegrationDefinitionFile(fixture.definitionPath, fixture.versionRoot)).toEqual(definition);
    });

    test("resolves nested includes relative to their declaring files", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write("definitions/root.json", fixture.canonical({ label: { $include: "meta/label.json" } }));
        fixture.write("definitions/meta/label.json", { $include: "text.json" });
        fixture.write("definitions/meta/text.json", "Nested label");

        const resolved = await resolveIntegrationDefinitionFile(fixture.definitionPath, fixture.versionRoot);

        expect(resolved).toEqual(fixture.canonical({ label: "Nested label" }));
    });

    test("builds ordered lists and flattens object and array files", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write("definitions/root.json", fixture.canonical({ inputs: { $files: ["inputs/group.json"] } }));
        fixture.write("definitions/inputs/group.json", {
            $files: ["text.json", "more.json"],
        });
        fixture.write("definitions/inputs/text.json", { name: "first", label: "First", type: "text" });
        fixture.write("definitions/inputs/more.json", [
            { name: "second", label: "Second", type: "boolean" },
            { name: "third", label: "Third", type: "url" },
        ]);

        const resolved = await resolveIntegrationDefinitionFile(fixture.definitionPath, fixture.versionRoot);

        expect((resolved as { inputs: unknown[] }).inputs).toEqual([
            { name: "first", label: "First", type: "text" },
            { name: "second", label: "Second", type: "boolean" },
            { name: "third", label: "Third", type: "url" },
        ]);
    });

    test("supports directives deeply inside regular arrays and objects", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write(
            "definitions/root.json",
            fixture.canonical({
                metadata: {
                    nested: [{ values: { $files: ["values/one.json", "values/two.json"] } }],
                },
            }),
        );
        fixture.write("definitions/values/one.json", { id: 1, value: { $include: "label.json" } });
        fixture.write("definitions/values/label.json", "one");
        fixture.write("definitions/values/two.json", [{ id: 2 }, { id: 3 }]);

        const resolved = await resolveIntegrationDefinitionFile(fixture.definitionPath, fixture.versionRoot);

        const metadata = (resolved as { metadata: { nested: Array<{ values: unknown[] }> } }).metadata;
        expect(metadata.nested[0]?.values).toEqual([{ id: 1, value: "one" }, { id: 2 }, { id: 3 }]);
    });

    test("preserves reserved JavaScript property names as ordinary JSON keys", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.writeText(
            "definitions/root.json",
            '{"schema":"cms.integration.definition.v1","kind":"demo","label":"Demo","version":"1.0.0","inputs":[],"__proto__":{"safe":true}}',
        );

        const resolved = (await resolveIntegrationDefinitionFile(
            fixture.definitionPath,
            fixture.versionRoot,
        )) as Record<string, unknown>;

        expect(Object.hasOwn(resolved, "__proto__")).toBe(true);
        expect(resolved.__proto__).toEqual({ safe: true });
        expect(Object.getPrototypeOf(resolved)).toBe(Object.prototype);
    });
});
