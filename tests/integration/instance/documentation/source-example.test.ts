import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseSourceSnapshot } from "@bernouy/cms-repository/repository/authoring";
import { prepareCollectionRelease } from "@bernouy/cms-repository/collections/build";

test("the complete collection snapshot printed in the contract guide builds without hidden fixture files", async () => {
    const path = resolve(
        import.meta.dir,
        "../../../../packages/official-repository/contracts/cms.authoring/docs/collection-source.md",
    );
    const guide = await Bun.file(path).text();
    const example = guide.match(/```json\n([\s\S]*?)\n```/u)?.[1];
    expect(example).toBeDefined();
    const snapshot = parseSourceSnapshot(example!);
    const root = await mkdtemp(join(tmpdir(), "ulvia-guide-example-"));
    const directory = join(root, "guide-kit");
    try {
        for (const file of snapshot.files) {
            const target = join(directory, file.path);
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, file.content);
        }
        const artifact = await prepareCollectionRelease(directory);
        expect(artifact.digest).toMatch(/^sha256:[a-f0-9]{64}$/u);
        expect(artifact.release.collectionId).toBe("your-namespace/guide-kit");
        expect(artifact.release.blocs).toHaveLength(1);
        expect(artifact.release.examples?.map((item) => item.id)).toEqual(["panel"]);
        expect(artifact.release.assets).toEqual([]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
