import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { LocalCollectionRepository, LocalRepositoryYanks } from "@bernouy/repository/repository/filesystem";
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

test("push all publishes SDK artifacts without builtin collections, then inferred provider pushes are idempotent", async () => {
    const f = await pushFixture();
    const source = resolve(import.meta.dir, "../../../dist/bootstrap");
    try {
        await f.run(["release", resolve(import.meta.dir, "../../../../../../infra/releases")]);
        f.output.length = 0;
        await f.run(["push", "all"]);
        expect(await f.remoteFiles.list("contracts")).toHaveLength(12);
        expect(await f.remoteFiles.list("providers")).toHaveLength(1);
        expect(await new LocalCollectionRepository(f.remote).list()).toEqual([]);
        expect(f.output.slice(1, 13).every((line) => line.startsWith("+ contract"))).toBe(true);
        expect(f.output[13]).toStartWith("+ provider-manifest");
        expect(f.output.at(-1)).toBe("Published 13 local releases.");
        const provider = JSON.parse(await readFile(join(source, "providers/primary-provider/definition.json"), "utf8"));
        await f.run(["push", `${provider.providerId}@${provider.version}`]);
        expect(f.output.at(-1)).toStartWith("= provider-manifest");
    } finally {
        await f.close();
    }
}, 45_000);
