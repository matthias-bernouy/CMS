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
            resolve(import.meta.dir, "../../../../official-repository/collections/ulvia-official"),
        );
        const version = artifact.release.version;
        expect(await repository.store(artifact)).toBe(true);
        expect(await repository.store(artifact)).toBe(false);
        const entries = await source.list();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            publisherId: "ulvia.official",
            collectionId: "ulvia-official",
            version,
            blocCount: 74,
            hasTheme: true,
        });
        const bundle = await source.get(entries[0]!);
        expect((await admitCollectionRelease(bundle.release, bundle.assets)).digest).toBe(entries[0]!.digest);
        expect(bundle.assets).toEqual([]);
        const release = bundle.release;
        expect(release.blocs).toHaveLength(74);
        expect(release.exports?.blocs).toHaveLength(67);
        expect(release.exports?.themeTokens).toHaveLength(119);
        expect(release.theme?.categories.flatMap((category) => category.tokens)).toHaveLength(119);
        expect(release.views?.find((view) => view.id === "catalog")?.html).toContain(
            "/.cms/call/catalog.items/item.list",
        );
        expect(release.dashboards?.[0]?.contracts).toEqual(["catalog.items"]);
        const action = release.blocs.find((bloc) => bloc.id === "ulvia-official-action");
        expect(action?.kind).toBe("component");
        if (action?.kind === "component") {
            expect(action.runtime?.viewJS).toContain("ulvia-official-action");
            expect(action.nativeElement).toEqual({ accepts: ["button", "a"] });
            expect(action.lightdom).toBeUndefined();
            expect(action.defaultContent).toContain('<button type="button">');
            expect(action.settings?.map((setting) => setting.id)).toEqual(["variant", "tone", "size", "wide"]);
        }
        const heading = release.blocs.find((bloc) => bloc.id === "ulvia-official-heading");
        expect(heading?.kind === "component" ? heading.nativeElement?.accepts : undefined).toEqual([
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
        ]);
        const grid = release.blocs.find((bloc) => bloc.id === "ulvia-official-grid");
        expect(grid?.settings?.find((setting) => setting.id === "columns")).toMatchObject({
            type: "integer",
            minimum: 1,
            maximum: 6,
            default: 3,
        });
        const textIds = new Set(release.texts?.map((entry) => entry.id));
        for (const bloc of release.blocs) {
            if (!bloc.lightdom) {
                continue;
            }
            for (const match of bloc.lightdom.matchAll(/cms\.i18n\.ulvia-official\.([a-z-]+)/g)) {
                expect(textIds.has(match[1]!)).toBeTrue();
            }
        }
        expect((await fetch(`${server.url}/v1/collections/missing/test/${version}`)).status).toBe(404);
        const assets = artifact.assets.map(({ id, bytes }) => ({ id, bytes }));
        const build = await admitCollectionRelease({ ...artifact.release, version: "1.3.3+build.1" }, assets);
        await repository.store(build);
        const buildEntry = (await source.list()).find((entry) => entry.version === "1.3.3+build.1");
        expect(buildEntry).toBeDefined();
        const buildBundle = await source.get(buildEntry!);
        expect((await admitCollectionRelease(buildBundle.release, buildBundle.assets)).digest).toBe(build.digest);
        await writeFile(join(root, "legacy-file"), "obsolete");
        await mkdir(join(root, "legacy-packages", "sealed"), { recursive: true });
        await writeFile(join(root, "legacy-packages", "sealed", "package.json"), "{}");
        await chmod(join(root, "legacy-packages", "sealed"), 0o500);
        await repository.prune();
        expect(await source.list()).toEqual([]);
        expect((await fetch(`${server.url}/v1/collections/ulvia.official/ulvia-official/${version}`)).status).toBe(404);
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
            resolve(import.meta.dir, "../../../../official-repository/collections/ulvia-official"),
        );
        await repository.store(artifact);
        const changed = await admitCollectionRelease(
            {
                ...artifact.release,
                translations: {
                    ...artifact.release.translations,
                    en: { ...artifact.release.translations.en, "collection.name": "Changed" },
                },
            },
            artifact.assets.map(({ id, bytes }) => ({ id, bytes })),
        );
        await expect(repository.store(changed)).rejects.toThrow("already exists with different content");
        expect((await repository.get("ulvia.official", "ulvia-official", artifact.release.version))?.digest).toBe(
            artifact.digest,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
