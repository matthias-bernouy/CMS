import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli";
import { LocalCollectionRepository } from "../../src/repository/local";

test("release publishes a folder explicitly, survives CLI runs, and prune clears only the repository", async () => {
    const data = await mkdtemp(join(tmpdir(), "ulvia-cli-release-"));
    const source = resolve(import.meta.dir, "../../../../official-repository/collections/ulvia-official");
    const definition = (await Bun.file(join(source, "definition.json")).json()) as { version: string };
    const output: string[] = [];
    const options = { environment: { ULVIA_DATA_DIR: data }, log: (line: string) => output.push(line) };
    try {
        const repository = new LocalCollectionRepository(join(data, "repository"));
        await runCli(["release", source], options);
        expect((await repository.list()).map((item) => item.release.collectionId)).toEqual(["ulvia-official"]);
        await runCli(["release", source], options);
        expect(output.at(-1)).toStartWith(`= collection ulvia.official/ulvia-official@${definition.version}`);
        await runCli(["prune"], options);
        expect(await repository.list()).toEqual([]);
        expect(await readdir(join(data, "repository"))).toEqual([]);
        expect(await readdir(join(data, "dev"))).toContain("mongo");
    } finally {
        await rm(data, { recursive: true, force: true });
    }
});
