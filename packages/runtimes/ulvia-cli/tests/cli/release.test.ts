import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { resolveCollectionTranslation } from "@bernouy/cms-repository/collections";

test("release publishes a folder explicitly, survives CLI runs, and prune clears only the repository", async () => {
    const data = await mkdtemp(join(tmpdir(), "ulvia-cli-release-"));
    const source = resolve(import.meta.dir, "../../../../official-repository/collections/ulvia-official");
    const catalogContract = resolve(import.meta.dir, "../../../../official-repository/contracts/catalog.items");
    const coreContracts = [
        "ulvia.cms.access",
        "ulvia.cms.collections",
        "ulvia.cms.design",
        "ulvia.cms.files",
        "ulvia.cms.operations",
        "ulvia.cms.pages",
        "ulvia.cms.providers",
    ].map((id) => resolve(import.meta.dir, `../../../../official-repository/contracts/${id}`));
    const definition = (await Bun.file(join(source, "definition.json")).json()) as {
        version: string;
        exports: { blocs: string[]; texts: string[] };
    };
    const output: string[] = [];
    const options = { environment: { ULVIA_DATA_DIR: data }, log: (line: string) => output.push(line) };
    try {
        const repository = new LocalCollectionRepository(join(data, "repository"));
        await runCli(["release", catalogContract], options);
        for (const contract of coreContracts) {
            await runCli(["release", contract], options);
        }
        await runCli(["release", source], options);
        const releases = await repository.list();
        expect(releases.map((item) => item.release.collectionId)).toEqual(["ulvia-official"]);
        expect(releases[0]!.release.theme?.categories.map((category) => category.id)).toEqual([
            "surfaces-and-text",
            "actions",
            "feedback",
            "typography",
            "spacing",
            "borders-and-shape",
            "elevation",
            "layout",
            "motion",
        ]);
        expect(releases[0]!.release.theme?.label).toBe("theme.label");
        expect(resolveCollectionTranslation(releases[0]!.release, releases[0]!.release.theme!.label)).toBe(
            "Ulvia Official foundation",
        );
        const releaseBlocIds = releases[0]!.release.blocs.map((bloc) => bloc.id);
        expect([...(releases[0]!.release.exports?.blocs ?? [])].sort()).toEqual([...definition.exports.blocs].sort());
        expect(definition.exports.blocs.every((id) => releaseBlocIds.includes(id))).toBe(true);
        expect(releaseBlocIds).toContain("ulvia-official-choice-copy");
        expect(releases[0]!.release.exports?.themeTokens).toHaveLength(119);
        expect(releases[0]!.release.exports?.texts).toEqual(definition.exports.texts.slice().sort());
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
