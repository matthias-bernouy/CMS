import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, spyOn, test } from "bun:test";
import { blocEntries, buildBundle, declarationStub } from "../../src/tooling/build";

describe("component build tooling", () => {
    test("keeps every public bloc entry unique and backed by a source file", async () => {
        const names = blocEntries.map(([name]) => name);
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain("token-input");

        const packageRoot = resolve(import.meta.dir, "../..");
        await Promise.all(blocEntries.map(([, entry]) => access(resolve(packageRoot, entry))));
    });

    test("derives declaration re-exports from source entrypoints", () => {
        expect(declarationStub("./src/ui/Form/Inputs/TokenInput/TokenInput.ts")).toBe(
            'export * from "../ui/Form/Inputs/TokenInput/TokenInput";\n',
        );
    });

    test("builds a minified browser bundle with the requested module format", async () => {
        let options: unknown;
        await buildBundle("./src/index.ts", "./dist", "index.js", "esm", async (received) => {
            options = received;
            return { success: true, logs: [] };
        });

        expect(options).toEqual({
            entrypoints: ["./src/index.ts"],
            outdir: "./dist",
            target: "browser",
            format: "esm",
            minify: true,
            naming: "index.js",
        });
    });

    test("reports bundle diagnostics before failing the build", async () => {
        const error = spyOn(console, "error").mockImplementation(() => {});
        try {
            await expect(
                buildBundle("./src/broken.ts", "./dist", "broken.js", "iife", async () => ({
                    success: false,
                    logs: ["invalid import"],
                })),
            ).rejects.toThrow("Failed to build ./src/broken.ts");
            expect(error).toHaveBeenCalledWith("invalid import");
        } finally {
            error.mockRestore();
        }
    });
});
