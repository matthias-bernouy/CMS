import { expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { writeAuthoredContractFixture } from "../../authoredContractFixture";
import { join, resolve } from "node:path";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { batchFixture } from "./fixtures";

test("recursive release orders dependencies independently of directory names and remains idempotent", async () => {
    const f = await batchFixture();
    try {
        await f.contract("a.consumer", { dependency: "z.provider" });
        await f.contract("z.provider");
        await f.run(["release", f.source, "--recursive"]);
        expect(f.output[0]).toStartWith("+ contract batch/z.provider@1.0.0");
        expect(f.output[1]).toStartWith("+ contract batch/a.consumer@1.0.0");
        expect(await f.files.list("contracts")).toHaveLength(2);
        f.output.length = 0;
        await f.run(["release", "--recursive", f.source]);
        expect(f.output.filter((line) => line.startsWith("= contract"))).toHaveLength(2);
        expect(f.output.at(-1)).toBe("Prepared 2 local releases.");
    } finally {
        await f.close();
    }
});

test("recursive release respects semantic version order across grouped sources", async () => {
    const f = await batchFixture();
    try {
        await f.contract("batch.example", { group: "v10", version: "1.10.0" });
        await f.contract("batch.example", { group: "v2", version: "1.2.0" });
        await f.run(["release", f.source, "--recursive"]);
        expect(f.output[0]).toContain("@1.2.0");
        expect(f.output[1]).toContain("@1.10.0");
    } finally {
        await f.close();
    }
});

test("recursive release prepares the official contracts, provider and collection without descending into owned sources", async () => {
    const f = await batchFixture();
    const source = resolve(import.meta.dir, "../../../../../official-repository");
    try {
        await f.run(["release", source, "--recursive"]);
        expect(await f.files.list("contracts")).toHaveLength(9);
        expect(await f.files.list("providers")).toHaveLength(1);
        const collections = await new LocalCollectionRepository(join(f.data, "repository")).list();
        expect(collections).toHaveLength(1);
        expect(collections[0]!.assets).toHaveLength(54);
        expect(collections[0]!.release.examples).toHaveLength(77);
        expect(f.output[9]).toStartWith("+ provider ulvia.official/ulvia.official@");
        expect(f.output[10]).toStartWith("+ collection ulvia.official/ulvia-official@");
        expect(f.output.at(-1)).toBe("Prepared 11 local releases.");
    } finally {
        await f.close();
    }
}, 30_000);

test("recursive release preserves verified contract fixture bytes", async () => {
    const f = await batchFixture();
    try {
        const fixtures = resolve(
            import.meta.dir,
            "../../../../../features/cms-repository/fixtures/contracts/protocol-v1",
        );
        const directory = join(f.source, "communication.receipt");
        await writeAuthoredContractFixture(directory, await readFile(join(fixtures, "mock.contract.json")));
        const asset = await readFile(join(fixtures, "mock-assets/receipt.svg"));
        await mkdir(join(directory, "fixtures"));
        await writeFile(join(directory, "fixtures/receipt.svg"), asset);
        await f.run(["release", f.source, "--recursive"]);
        const stored = await f.files.get("contracts", "ulvia.official", "communication.receipt", "0.1.0");
        expect(stored).not.toBeNull();
        expect(await f.files.fixture(stored!.toString("utf8"), "receipt.svg")).toEqual(asset);
    } finally {
        await f.close();
    }
});
