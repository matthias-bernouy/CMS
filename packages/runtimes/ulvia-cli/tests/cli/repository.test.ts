import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { LocalCollectionRepository } from "../../src/repository/local";
import { prepareCollectionRelease } from "../../src/release/source";
import { startLocalRepository } from "../../src/runtime/repository";

test("local repository lists immutable metadata and serves matching release bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-repository-"));
    const repository = new LocalCollectionRepository(root);
    const server = startLocalRepository(0, root);
    try {
        const source = new HttpCollectionRepository("local", server.url);
        expect(await source.list()).toEqual([]);
        const artifact = await prepareCollectionRelease(
            resolve(import.meta.dir, "../../../../resources/collections/test"),
        );
        expect(await repository.store(artifact)).toBe(true);
        expect(await repository.store(artifact)).toBe(false);
        const entries = await source.list();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ collectionId: "test", version: "1.3.2", blocCount: 8, hasTheme: true });
        const release = await source.get(entries[0]!);
        expect((await admitCollectionRelease(release)).digest).toBe(entries[0]!.digest);
        expect(release.blocs).toHaveLength(8);
        expect(release.theme?.categories.flatMap((category) => category.tokens)).toHaveLength(7);
        const card = release.blocs.find((bloc) => bloc.id === "test-feature-card");
        expect(card?.kind).toBe("component");
        if (card?.kind === "component") {
            expect(card.runtime?.viewJS).toContain("test-feature-card");
            expect(card.runtime?.editorJS).toContain("test-feature-card");
            expect(card.lightdom).toContain("feature-card-note");
            expect(card.defaultContent).toContain("Feature title");
            expect(card.settings).toEqual([
                {
                    id: "tone",
                    label: "Tone",
                    group: "Appearance",
                    type: "string",
                    enum: ["quiet", "accent"],
                    maxLength: 16,
                    default: "quiet",
                },
                {
                    id: "compact",
                    label: "Compact",
                    group: "Layout",
                    type: "boolean",
                    default: false,
                    visibleWhen: [{ setting: "tone", equals: "accent" }],
                },
            ]);
        }
        const textIds = new Set(release.texts?.map((entry) => entry.id));
        for (const bloc of release.blocs) {
            if (!bloc.lightdom) {
                continue;
            }
            for (const match of bloc.lightdom.matchAll(/cms\.i18n\.test\.([a-z-]+)/g)) {
                expect(textIds.has(match[1]!)).toBeTrue();
            }
        }
        expect((await fetch(`${server.url}/v1/collections/missing/test/1.3.2`)).status).toBe(404);
        const build = await admitCollectionRelease({ ...artifact.release, version: "1.3.3+build.1" });
        await repository.store(build);
        const buildEntry = (await source.list()).find((entry) => entry.version === "1.3.3+build.1");
        expect(buildEntry).toBeDefined();
        expect((await admitCollectionRelease(await source.get(buildEntry!))).digest).toBe(build.digest);
        await writeFile(join(root, "legacy-file"), "obsolete");
        await mkdir(join(root, "legacy-packages", "sealed"), { recursive: true });
        await writeFile(join(root, "legacy-packages", "sealed", "package.json"), "{}");
        await chmod(join(root, "legacy-packages", "sealed"), 0o500);
        await repository.prune();
        expect(await source.list()).toEqual([]);
        expect((await fetch(`${server.url}/v1/collections/ulvia.examples/test/1.3.2`)).status).toBe(404);
    } finally {
        server.stop();
        await rm(root, { recursive: true, force: true });
    }
});

test("a release coordinate cannot be replaced with different content", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-repository-"));
    try {
        const repository = new LocalCollectionRepository(root);
        const artifact = await prepareCollectionRelease(
            resolve(import.meta.dir, "../../../../resources/collections/test"),
        );
        await repository.store(artifact);
        const changed = await admitCollectionRelease({ ...artifact.release, name: "Changed" });
        await expect(repository.store(changed)).rejects.toThrow("already exists with different content");
        expect((await repository.get("ulvia.examples", "test", "1.3.2"))?.digest).toBe(artifact.digest);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
