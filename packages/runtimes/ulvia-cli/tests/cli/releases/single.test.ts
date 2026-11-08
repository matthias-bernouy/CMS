import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../../src/cli";
import { LocalCollectionRepository } from "@bernouy/repository/repository/filesystem";

test("release publishes a folder explicitly, survives CLI runs, and prune clears only the repository", async () => {
    const data = await mkdtemp(join(tmpdir(), "ulvia-cli-release-"));
    const source = resolve(import.meta.dir, "../../stack/fixtures/smoke-kit");
    const definition = (await Bun.file(join(source, "definition.json")).json()) as {
        version: string;
        exports: { blocs: string[]; texts: string[] };
    };
    const output: string[] = [];
    const options = { environment: { ULVIA_DATA_DIR: data }, log: (line: string) => output.push(line) };
    try {
        const repository = new LocalCollectionRepository(join(data, "repository"));
        await runCli(["release", source], options);
        const releases = await repository.list();
        expect(releases.map((item) => item.release.collectionId)).toEqual(["ulvia.test/smoke-kit"]);
        expect(releases[0]!.release.blocs.map(({ id }) => id)).toEqual(["ulvia-dtest--smoke-kit--card"]);
        expect(releases[0]!.release.exports?.blocs).toEqual(["ulvia-dtest--smoke-kit--card"]);
        await runCli(["release", source], options);
        expect(output.at(-1)).toStartWith(`= collection ulvia.test/smoke-kit@${definition.version}`);
        const lockPath = join(data, "repository/.write-lock");
        const lock = await stat(lockPath, { bigint: true });
        await runCli(["prune"], options);
        expect(await repository.list()).toEqual([]);
        expect(await readdir(join(data, "repository"))).toEqual([".write-lock"]);
        expect((await stat(lockPath, { bigint: true })).ino).toBe(lock.ino);
        expect((await stat(lockPath)).size).toBe(0);
        expect(await readdir(join(data, "services"))).toContain("mongo");
    } finally {
        await rm(data, { recursive: true, force: true });
    }
}, 20_000);
