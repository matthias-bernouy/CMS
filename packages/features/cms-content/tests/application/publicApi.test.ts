import * as content from "@bernouy/cms-content";
import * as mongo from "@bernouy/cms-content/mongo";
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import * as rendering from "@bernouy/cms-content/rendering";
import { CMS_BROWSER_RUNTIME_ABI } from "@bernouy/cms-content/runtime-abi";

test("publishes the browser behavior ABI through its dedicated entrypoint", () => {
    expect(CMS_BROWSER_RUNTIME_ABI).toBe("v1");
});

test("rendering entrypoints omit authoring mutations and concrete stores", () => {
    expect(rendering.createContentReader).toBeFunction();
    for (const name of ["InMemoryContentRepository", "ValidatingContentRepository", "resolvePublishedRoute"]) {
        expect(rendering).not.toHaveProperty(name);
    }
});

test("browser-safe content entrypoints bundle without persistence or image adapters", async () => {
    const result = await Bun.build({
        entrypoints: ["bindings.ts", "theme.ts", "pages/path.ts"].map((entry) =>
            resolve(import.meta.dir, "../../src/exports", entry),
        ),
        target: "browser",
        write: false,
    });
    expect(result.logs).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.outputs).toHaveLength(3);
    for (const output of result.outputs) {
        expect(await output.text()).not.toMatch(/sharp|MongoContentRepository|LocalFsBlobStore|S3BlobStore/);
    }
});

test("content persistence exports use the ContentRepository vocabulary exclusively", () => {
    expect(content.InMemoryContentRepository).toBeFunction();
    expect(content.ValidatingContentRepository).toBeFunction();
    expect(mongo.MongoContentRepository).toBeFunction();
    expect(content).not.toHaveProperty("InMemoryCmsRepository");
    expect(content).not.toHaveProperty("ValidatingCmsRepository");
    expect(mongo).not.toHaveProperty("MongoCmsRepository");
});
