import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { LocalCollectionRepository, LocalRepositoryYanks } from "@bernouy/cms-repository/repository/filesystem";
import { pushFixture } from "./fixtures";

test("push all orders inherited contracts and omits locally yanked releases", async () => {
    const f = await pushFixture();
    try {
        await f.contract("z.provider");
        await f.contract("a.consumer", { parent: "z.provider" });
        await f.contract("hidden.example");
        await f.run(["release", f.source, "--recursive"]);
        await new LocalRepositoryYanks(join(f.data, "repository")).set(
            "contract",
            "ulvia",
            "ulvia/hidden.example",
            "1.0.0",
            "Local withdrawal",
        );
        f.output.length = 0;
        await f.run(["push", "all"]);
        expect(f.output[1]).toStartWith("+ contract ulvia/z.provider@");
        expect(f.output[2]).toStartWith("+ contract ulvia/a.consumer@");
        expect(await f.remoteFiles.list("contracts")).toHaveLength(2);
        expect(await f.remoteFiles.get("contracts", "ulvia", "ulvia/hidden.example", "1.0.0")).toBeNull();
        expect(f.output.at(-1)).toBe("Published 2 local releases.");
        await expect(f.run(["push", "ulvia/hidden.example@1.0.0"])).rejects.toThrow("locally yanked");
    } finally {
        await f.close();
    }
});

test("push all publishes every official artifact kind, then inferred provider and collection pushes are idempotent", async () => {
    const f = await pushFixture();
    const source = resolve(import.meta.dir, "../../../../../official-repository");
    try {
        await f.run(["release", source, "--recursive"]);
        f.output.length = 0;
        await f.run(["push", "all"]);
        expect(await f.remoteFiles.list("contracts")).toHaveLength(12);
        expect(await f.remoteFiles.list("providers")).toHaveLength(1);
        expect(
            (await new LocalCollectionRepository(f.remote).list()).map(({ release }) => release.collectionId),
        ).toEqual(["ulvia/mossa", "ulvia/repository"]);
        expect(f.output.slice(1, 13).every((line) => line.startsWith("+ contract"))).toBe(true);
        expect(f.output[13]).toStartWith("+ provider-manifest");
        expect(f.output[14]).toStartWith("+ collection ulvia/mossa@");
        expect(f.output[15]).toStartWith("+ collection ulvia/repository@");
        expect(f.output.at(-1)).toBe("Published 15 local releases.");
        const provider = JSON.parse(await readFile(join(source, "providers/primary-provider/definition.json"), "utf8"));
        const collection = JSON.parse(await readFile(join(source, "collections/mossa/definition.json"), "utf8"));
        await f.run(["push", `${provider.providerId}@${provider.version}`]);
        expect(f.output.at(-1)).toStartWith("= provider-manifest");
        await f.run(["push", `${collection.collectionId}@${collection.version}`]);
        expect(f.output.at(-1)).toStartWith("= collection");
        await f.run(["push", "collection", "ulvia/repository@1.0.0"]);
        expect(f.output.at(-1)).toStartWith("= collection");
    } finally {
        await f.close();
    }
}, 45_000);
