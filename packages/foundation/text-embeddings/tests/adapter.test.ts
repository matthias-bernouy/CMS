import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TransformersEmbeddings, DEFAULT_EMBEDDING_MODEL, DEFAULT_EMBEDDING_REVISION } from "@bernouy/text-embeddings";

test("the packaged model manifest matches the runtime defaults", async () => {
    const release = await Bun.file(new URL("../../../../infra/models/release.json", import.meta.url)).json();
    expect(release.model).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(release.revision).toBe(DEFAULT_EMBEDDING_REVISION);
});

test("the adapter requires pinned model pairs and bounded worker inputs", async () => {
    expect(() => new TransformersEmbeddings({ cacheDirectory: "/unused", model: "example/model" })).toThrow();
    expect(() => new TransformersEmbeddings({ cacheDirectory: "/unused", threads: 0 })).toThrow();
    const model = new TransformersEmbeddings({ cacheDirectory: "/unused" });
    expect(model.model).toContain(DEFAULT_EMBEDDING_REVISION);
    await expect(model.embed([], "query", new AbortController().signal)).rejects.toThrow("budget");
    await model.close();
});

test("an offline empty cache fails locally and the worker closes cleanly", async () => {
    const root = await mkdtemp(join(tmpdir(), "text-embeddings-offline-"));
    const model = new TransformersEmbeddings({ cacheDirectory: root, localFilesOnly: true });
    try {
        await expect(model.initialize(new AbortController().signal)).rejects.toThrow("not cached");
    } finally {
        await model.close();
        await rm(root, { recursive: true, force: true });
    }
});
