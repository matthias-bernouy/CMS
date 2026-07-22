import { describe, expect, test } from "bun:test";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveIntegrationDefinitionFile } from "@bernouy/cms-integrations/fs";
import { createBundleFixture, writeJsonFile } from "./fixture";

describe("definition bundle confinement", () => {
    test("rejects traversal outside the selected version", async () => {
        const fixture = createBundleFixture();
        fixture.bundle();
        fixture.write("outside.json", []);
        fixture.write("definitions/root.json", fixture.canonical({ inputs: { $include: "../../outside.json" } }));

        await expect(resolve(fixture)).rejects.toThrow(/escapes integration version root/);
    });

    test("rejects absolute paths and ambiguous backslashes", async () => {
        const absolute = createBundleFixture();
        absolute.bundle();
        absolute.write("definitions/root.json", absolute.canonical({ inputs: { $include: "/tmp/input.json" } }));

        const absoluteError = await failureMessage(resolve(absolute));
        expect(absoluteError).toMatch(/definitions\/root\.json.*must be relative/);
        expect(absoluteError).not.toContain(absolute.versionRoot);

        const windows = createBundleFixture();
        windows.bundle();
        windows.write("definitions/root.json", windows.canonical({ inputs: { $include: "C:/input.json" } }));

        await expect(resolve(windows)).rejects.toThrow(/must be relative/);

        const backslash = createBundleFixture();
        backslash.bundle();
        backslash.write("definitions/root.json", backslash.canonical({ inputs: { $include: "inputs\\item.json" } }));

        await expect(resolve(backslash)).rejects.toThrow(/must not contain backslashes/);
    });

    test("rejects symlinks that leave the selected version", async () => {
        const fixture = createBundleFixture();
        const outside = mkdtempSync(join(tmpdir(), "cms-definition-outside-"));
        const outsideFile = join(outside, "inputs.json");
        writeJsonFile(outsideFile, []);
        fixture.bundle();
        fixture.write("definitions/root.json", fixture.canonical({ inputs: { $include: "inputs.json" } }));
        symlinkSync(outsideFile, join(fixture.versionRoot, "definitions", "inputs.json"), "file");

        await expect(resolve(fixture)).rejects.toThrow(/escapes integration version root/);
    });

    test("confines the entry definition path itself", async () => {
        const fixture = createBundleFixture();
        const outside = mkdtempSync(join(tmpdir(), "cms-definition-entry-outside-"));
        const outsideFile = join(outside, "definition.json");
        writeJsonFile(outsideFile, fixture.canonical());
        symlinkSync(outsideFile, fixture.definitionPath, "file");

        await expect(resolve(fixture)).rejects.toThrow(/escapes integration version root/);
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
