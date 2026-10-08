import { expect, test } from "bun:test";
import { resolve } from "node:path";
import * as rendering from "@bernouy/cms-content/rendering";

test("rendering entrypoints omit authoring mutations and concrete stores", () => {
    expect(rendering.createContentReader).toBeFunction();
    for (const name of ["InMemoryCmsRepository", "ValidatingCmsRepository", "resolvePublishedRoute"]) {
        expect(rendering).not.toHaveProperty(name);
    }
});

test("browser-safe content entrypoints bundle without persistence or image adapters", async () => {
    const result = await Bun.build({
        entrypoints: ["bindings.ts", "theme.ts", "page-path.ts"].map((entry) =>
            resolve(import.meta.dir, "../../src/exports", entry),
        ),
        target: "browser",
        write: false,
    });
    expect(result.logs).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.outputs).toHaveLength(3);
    for (const output of result.outputs) {
        expect(await output.text()).not.toMatch(/sharp|MongoCmsRepository|LocalFsBlobStore|S3BlobStore/);
    }
});
