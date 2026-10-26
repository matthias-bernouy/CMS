import { expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { batchFixture } from "./fixtures";

test("missing dependencies and dependency cycles fail before writing the local cache", async () => {
    for (const cyclic of [false, true]) {
        const f = await batchFixture();
        try {
            await f.contract("batch.first", { dependency: "batch.second" });
            if (cyclic) {
                await f.contract("batch.second", { dependency: "batch.first" });
            }
            await expect(f.run(["release", f.source, "--recursive"])).rejects.toThrow();
            expect(await f.files.list("contracts")).toEqual([]);
            expect(f.output).toEqual([]);
        } finally {
            await f.close();
        }
    }
});

test("an invalid provider prevents otherwise valid contracts from being written", async () => {
    const f = await batchFixture();
    try {
        await f.contract("batch.valid");
        const provider = join(f.source, "batch.provider");
        await mkdir(provider);
        await writeFile(
            join(provider, "definition.json"),
            JSON.stringify({ kind: "provider-manifest", providerId: "batch.provider", version: "1.0.0" }),
        );
        await expect(f.run(["release", f.source, "--recursive"])).rejects.toThrow();
        expect(await f.files.list("contracts")).toEqual([]);
        expect(await f.files.list("providers")).toEqual([]);
    } finally {
        await f.close();
    }
});

test("duplicate coordinates are rejected even when their source bytes match", async () => {
    const f = await batchFixture();
    try {
        await f.contract("batch.same", { group: "first" });
        await f.contract("batch.same", { group: "second" });
        await expect(f.run(["release", f.source, "--recursive"])).rejects.toThrow(
            "Duplicate authored release coordinate",
        );
        expect(await f.files.list("contracts")).toEqual([]);
    } finally {
        await f.close();
    }
});

test("discovery rejects empty roots, unsupported definitions and symbolic links", async () => {
    const f = await batchFixture();
    try {
        await expect(f.run(["release", f.source, "--recursive"])).rejects.toThrow("No authored release resources");
        const invalid = join(f.root, "invalid");
        await mkdir(invalid);
        await writeFile(join(invalid, "definition.json"), JSON.stringify({ kind: "bloc" }));
        await expect(f.run(["release", invalid, "--recursive"])).rejects.toThrow("Unsupported release root kind");
        await symlink(invalid, join(f.source, "linked"));
        await expect(f.run(["release", f.source, "--recursive"])).rejects.toThrow("symbolic links");
    } finally {
        await f.close();
    }
});

test("recursive release rejects symbolic definition files and ambiguous flags", async () => {
    const f = await batchFixture();
    try {
        const definition = join(f.root, "definition.json");
        await writeFile(definition, JSON.stringify({ kind: "contract" }));
        await symlink(definition, join(f.source, "definition.json"));
        await expect(f.run(["release", f.source, "--recursive"])).rejects.toThrow("regular file");
        await expect(f.run(["release", f.source, "--recursive", "--recursive"])).rejects.toThrow("Usage");
        await expect(f.run(["release", f.source, "--unknown"])).rejects.toThrow("Usage");
    } finally {
        await f.close();
    }
});
