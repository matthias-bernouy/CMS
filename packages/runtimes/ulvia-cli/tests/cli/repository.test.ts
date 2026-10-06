import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { prepareCollectionRelease } from "../../src/release/source";
import { startLocalRepository } from "../../src/runtime/repository";
import { officialContractCatalogue } from "../officialContractCatalogue";

test("local repository lists immutable metadata and serves matching release bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-repository-"));
    const repository = new LocalCollectionRepository(root);
    const server = startLocalRepository(0, root);
    try {
        const contracts = await officialContractCatalogue();
        const source = new HttpCollectionRepository("local", server.url);
        expect(await source.list()).toEqual([]);
        const artifact = await prepareCollectionRelease(
            resolve(import.meta.dir, "../../../../official-repository/collections/ulvia-official"),
            contracts,
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
            blocCount: 81,
            hasTheme: true,
        });
        const bundle = await source.get(entries[0]!);
        expect((await admitCollectionRelease(bundle.release, bundle.assets, { contracts })).digest).toBe(
            entries[0]!.digest,
        );
        expect(bundle.assets).toEqual([]);
        const release = bundle.release;
        expect(release.blocs).toHaveLength(81);
        expect(release.exports?.blocs).toHaveLength(68);
        expect(release.exports?.themeTokens).toHaveLength(119);
        expect(release.theme?.categories.flatMap((category) => category.tokens)).toHaveLength(119);
        expect(release.pages?.some((page) => page.id === "catalog" || page.id === "resources")).toBe(false);
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
        const build = await admitCollectionRelease({ ...artifact.release, version: "1.3.3+build.1" }, assets, {
            contracts,
        });
        await repository.store(build);
        const firstPage = await fetch(`${server.url}/v1/collections?limit=1`);
        expect(firstPage.status).toBe(200);
        const firstPageBody = (await firstPage.json()) as { releases: unknown[]; nextCursor?: string };
        expect(firstPageBody.releases).toHaveLength(1);
        expect(firstPageBody.nextCursor).toBeString();
        const secondPage = await fetch(
            `${server.url}/v1/collections?limit=1&cursor=${encodeURIComponent(firstPageBody.nextCursor!)}`,
        );
        expect(secondPage.status).toBe(200);
        expect(((await secondPage.json()) as { releases: unknown[] }).releases).toHaveLength(1);
        expect((await fetch(`${server.url}/v1/collections?limit=0`)).status).toBe(400);
        expect((await fetch(`${server.url}/v1/collections?unknown=true`)).status).toBe(400);
        const buildEntry = (await source.list()).find((entry) => entry.version === "1.3.3+build.1");
        expect(buildEntry).toBeDefined();
        const buildBundle = await source.get(buildEntry!);
        expect((await admitCollectionRelease(buildBundle.release, buildBundle.assets, { contracts })).digest).toBe(
            build.digest,
        );
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
            await officialContractCatalogue(),
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
            { contracts: await officialContractCatalogue() },
        );
        await expect(repository.store(changed)).rejects.toThrow("already exists with different content");
        expect((await repository.get("ulvia.official", "ulvia-official", artifact.release.version))?.digest).toBe(
            artifact.digest,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("collection source assets keep their verified bytes through the repository protocol", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-collection-assets-"));
    const sourceRoot = join(root, "asset-example");
    const repositoryRoot = join(root, "repository");
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    try {
        await mkdir(join(sourceRoot, "assets", "icons", "brand"), { recursive: true });
        await mkdir(join(sourceRoot, "translations", "en"), { recursive: true });
        const definition = {
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId: "asset-example",
            publisherId: "ulvia.official",
            version: "1.0.0",
            name: "collection.name",
            locale: "en",
            exports: "*",
            assets: [
                {
                    id: "brand-mark",
                    source: "icons/brand/mark.svg",
                    generation: 2,
                    mediaType: "image/svg+xml",
                },
            ],
        };
        const definitionPath = join(sourceRoot, "definition.json");
        await writeFile(definitionPath, JSON.stringify(definition));
        for (const [id, internal] of [
            ["asset-example-card", false],
            ["asset-example-card-frame", true],
        ] as const) {
            const root = join(sourceRoot, "blocs", id);
            await mkdir(root, { recursive: true });
            await writeFile(
                join(root, "definition.json"),
                JSON.stringify({ id, kind: "composition", label: `bloc.${id}.label`, internal, slots: {} }),
            );
            await writeFile(join(root, "lightdom.html"), "<p>Example</p>");
        }
        await writeFile(
            join(sourceRoot, "translations", "en", "collection.json"),
            JSON.stringify({
                "collection.name": "Asset example",
                "bloc.asset-example-card.label": "Card",
                "bloc.asset-example-card-frame.label": "Card frame",
            }),
        );
        await writeFile(join(sourceRoot, "assets", "icons", "brand", "mark.svg"), bytes);

        const artifact = await prepareCollectionRelease(sourceRoot);
        expect(artifact.release.assets[0]).toMatchObject({
            id: "brand-mark",
            generation: 2,
            mediaType: "image/svg+xml",
            byteLength: bytes.byteLength,
        });
        expect(artifact.release.assets[0]).not.toHaveProperty("source");
        expect(artifact.release.exports).toEqual({
            blocs: ["asset-example-card"],
            themeTokens: [],
            assets: ["brand-mark"],
        });
        expect(new Uint8Array(await artifact.assets[0]!.bytes.arrayBuffer())).toEqual(bytes);

        const repository = new LocalCollectionRepository(repositoryRoot);
        await repository.store(artifact);
        const server = startLocalRepository(0, repositoryRoot);
        try {
            const remote = new HttpCollectionRepository("local", server.url);
            const bundle = await remote.get((await remote.list())[0]!);
            expect(bundle.release.assets[0]).toEqual(artifact.release.assets[0]);
            expect(bundle.assets).toEqual([{ id: "brand-mark", bytes }]);
            expect((await admitCollectionRelease(bundle.release, bundle.assets)).digest).toBe(artifact.digest);
        } finally {
            server.stop();
        }

        definition.assets[0]!.source = "../outside.svg";
        await writeFile(definitionPath, JSON.stringify(definition));
        await expect(prepareCollectionRelease(sourceRoot)).rejects.toThrow("invalid source path");
        definition.assets[0]!.source = "icons/brand/mark.svg";
        await writeFile(definitionPath, JSON.stringify(definition));
        await writeFile(join(sourceRoot, "assets", "icons", "unused.svg"), bytes);
        await expect(prepareCollectionRelease(sourceRoot)).rejects.toThrow("exactly match");
        await unlink(join(sourceRoot, "assets", "icons", "unused.svg"));

        const pageRoot = join(sourceRoot, "pages", "control", "overview");
        await mkdir(pageRoot, { recursive: true });
        await writeFile(join(pageRoot, "definition.json"), JSON.stringify({ id: "overview" }));
        await writeFile(join(pageRoot, "page.html"), "<p>Overview</p>");
        await writeFile(join(pageRoot, "unexpected.txt"), "not part of the Page source contract");
        await expect(prepareCollectionRelease(sourceRoot)).rejects.toThrow("must contain exactly");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
