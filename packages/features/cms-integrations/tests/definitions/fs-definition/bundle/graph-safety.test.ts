import { describe, expect, test } from "bun:test";
import { chmodSync, statSync } from "node:fs";
import { resolveIntegrationDefinitionFileDetails } from "cms-integrations/default-implementation/fs-definition/definition-bundle/resolver";
import { createBundleFixture } from "./fixture";

describe("definition bundle graph safety", () => {
    test("reports direct and indirect inclusion cycles with the chain", async () => {
        const direct = createBundleFixture();
        direct.bundle();
        direct.write("definitions/root.json", { $include: "root.json" });

        await expect(resolve(direct)).rejects.toThrow(/definitions\/root\.json -> definitions\/root\.json/);

        const indirect = createBundleFixture();
        indirect.bundle();
        indirect.write("definitions/root.json", { $include: "nested/second.json" });
        indirect.write("definitions/nested/second.json", { $include: "../root.json" });

        await expect(resolve(indirect)).rejects.toThrow(
            /definitions\/root\.json -> definitions\/nested\/second\.json -> definitions\/root\.json/,
        );
    });

    test("rejects duplicate files within one $files directive", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write(
            "definitions/root.json",
            fixture.canonical({
                inputs: { $files: ["inputs/item.json", "inputs/../inputs/item.json"] },
            }),
        );
        fixture.write("definitions/inputs/item.json", { name: "item", label: "Item", type: "text" });

        await expect(resolve(fixture)).rejects.toThrow(/duplicate \$files entry/);
    });

    test("limits recursive inclusion depth", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write("definitions/root.json", { $include: "nested.json" });
        fixture.write("definitions/nested.json", fixture.canonical());

        await expect(resolve(fixture, { maxDepth: 1 })).rejects.toThrow(/1-level inclusion limit/);
    });

    test("limits referenced file count", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write("definitions/root.json", fixture.canonical({ inputs: { $files: ["input.json"] } }));
        fixture.write("definitions/input.json", { name: "item", label: "Item", type: "text" });

        await expect(resolve(fixture, { maxFiles: 2 })).rejects.toThrow(/2-file limit/);
    });

    test("rejects oversized $files lists before resolving their paths", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write(
            "definitions/root.json",
            fixture.canonical({
                inputs: { $files: Array.from({ length: 10_000 }, (_, index) => `missing-${index}.json`) },
            }),
        );

        await expect(resolve(fixture, { maxFiles: 3 })).rejects.toThrow(/3-file limit/);
    });

    test("limits total source bytes", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write("definitions/root.json", fixture.canonical());

        await expect(resolve(fixture, { maxBytes: 1 })).rejects.toThrow(/1-byte limit/);
    });

    test("checks source size before reading an oversized fragment", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write("definitions/root.json", fixture.canonical({ description: "unreadable oversized fragment" }));
        const entryBytes = statSync(fixture.definitionPath).size;
        const root = `${fixture.versionRoot}/definitions/root.json`;
        chmodSync(root, 0);
        try {
            await expect(resolve(fixture, { maxBytes: entryBytes + 1 })).rejects.toThrow(/byte limit/);
        } finally {
            chmodSync(root, 0o600);
        }
    });
});

function resolve(
    fixture: ReturnType<typeof createBundleFixture>,
    limits: { maxBytes?: number; maxDepth?: number; maxFiles?: number } = {},
): Promise<unknown> {
    return resolveIntegrationDefinitionFileDetails(fixture.definitionPath, fixture.versionRoot, limits);
}
