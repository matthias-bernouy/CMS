import { describe, expect, test } from "bun:test";
import { resolveIntegrationDefinitionFile } from "@bernouy/cms-integrations/fs";
import { createBundleFixture } from "./fixture";

describe("definition bundle validation", () => {
    test("rejects missing and invalid JSON files with their source", async () => {
        const missing = createBundleFixture();
        missing.bundle();
        missing.write("definitions/root.json", missing.canonical({ inputs: { $include: "missing.json" } }));

        const missingError = await failureMessage(resolve(missing));
        expect(missingError).toMatch(/definitions\/root\.json.*missing\.json/);
        expect(missingError).not.toContain(missing.versionRoot);

        const invalid = createBundleFixture();
        invalid.bundle();
        invalid.writeText("definitions/root.json", "{ invalid");

        await expect(resolve(invalid)).rejects.toThrow(/definitions\/root\.json: invalid JSON/);
    });

    test("rejects malformed or mixed directives", async () => {
        const cases: Array<[string, unknown, RegExp]> = [
            ["non-string include", { $include: 42 }, /\$include must be a non-empty JSON path/],
            ["non-array files", { $files: "item.json" }, /\$files must be an array/],
            ["non-string file", { $files: [42] }, /\$files must be an array/],
            ["mixed directives", { $include: "item.json", $files: [] }, /exactly one/],
            ["extra directive key", { $include: "item.json", optional: true }, /exactly one/],
        ];
        for (const [name, directive, error] of cases) {
            const fixture = createBundleFixture(name.replaceAll(" ", "-"));
            fixture.bundle();
            fixture.write("definitions/root.json", fixture.canonical({ inputs: directive }));

            await expect(resolve(fixture)).rejects.toThrow(error);
        }
    });

    test("requires JSON references and object-or-array $files results", async () => {
        const extension = createBundleFixture();
        extension.bundle();
        extension.write("definitions/root.json", extension.canonical({ inputs: { $include: "inputs.txt" } }));

        await expect(resolve(extension)).rejects.toThrow(/\.json extension/);

        const primitive = createBundleFixture();
        primitive.bundle();
        primitive.write("definitions/root.json", primitive.canonical({ inputs: { $files: ["value.json"] } }));
        primitive.write("definitions/value.json", "invalid list entry");

        await expect(resolve(primitive)).rejects.toThrow(/must resolve to objects or arrays/);
    });

    test("validates the bundle header and canonical root schema", async () => {
        const header = createBundleFixture();
        header.write("definition.json", {
            schema: "cms.integration.definition.bundle.v1",
            root: "definitions/root.json",
            extra: true,
        });

        await expect(resolve(header)).rejects.toThrow(/contain only schema/);

        const root = createBundleFixture();
        root.bundle();
        root.write("definitions/root.json", { kind: "demo", label: "Demo", version: "1.0.0", inputs: [] });

        await expect(resolve(root)).rejects.toThrow(/bundle root must be a cms\.integration\.definition\.v1/);
    });
});

function resolve(fixture: ReturnType<typeof createBundleFixture>): Promise<unknown> {
    return resolveIntegrationDefinitionFile(fixture.definitionPath, fixture.versionRoot);
}

async function failureMessage(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error("Expected promise to reject");
}
