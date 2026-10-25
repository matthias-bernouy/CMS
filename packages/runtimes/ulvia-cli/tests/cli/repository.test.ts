import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { prepareCollectionRelease } from "@bernouy/cms-repository/collections/build";
import { startTestRepository } from "../repository/fixture";
import { officialContractCatalogue } from "../officialContractCatalogue";
import { isValidRequestId, REQUEST_ID_HEADER } from "@bernouy/http-runner/observability";

test("local repository lists immutable metadata and serves matching release bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-repository-"));
    const repository = new LocalCollectionRepository(root);
    const server = startTestRepository(root);
    try {
        const contracts = await officialContractCatalogue();
        const source = new HttpCollectionRepository("local", server.url);
        expect(await source.list()).toEqual([]);
        const missing = await fetch(`${server.url}/v1/collections/missing/test/1.0.0`);
        expect(isValidRequestId(missing.headers.get(REQUEST_ID_HEADER) ?? "")).toBe(true);
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
            hasTheme: true,
        });
        const bundle = await source.get(entries[0]!);
        expect((await admitCollectionRelease(bundle.release, bundle.assets, { contracts })).digest).toBe(
            entries[0]!.digest,
        );
        expect(bundle.assets.map(({ id }) => id)).toEqual(
            [...bundle.assets.map(({ id }) => id)].sort((left, right) => left.localeCompare(right)),
        );
        expect(bundle.assets).toHaveLength(53);
        expect(bundle.assets.map(({ id }) => id)).toContain("icons/navigation/collections.svg");
        expect(bundle.assets.map(({ id }) => id)).toContain("fonts/sans/inter/normal.woff2");
        expect(bundle.assets.map(({ id }) => id)).toContain("fonts/serif/source-serif-4/italic.woff2");
        const svgAssets = bundle.release.assets.filter((asset) => asset.mediaType === "image/svg+xml");
        expect(svgAssets.find((asset) => asset.id === "icons/controls/check-white.svg")?.profiles).toBeUndefined();
        expect(
            svgAssets
                .filter((asset) => asset.id !== "icons/controls/check-white.svg")
                .every((asset) => asset.profiles?.includes("inline-svg")),
        ).toBe(true);
        expect(
            bundle.release.assets
                .filter((asset) => asset.id.endsWith(".woff2"))
                .every((asset) => asset.mediaType === "font/woff2" && asset.profiles === undefined),
        ).toBe(true);
        const release = bundle.release;
        expect(entries[0]?.blocCount).toBe(release.blocs.length);
        expect(release.exports?.blocs).toEqual(
            release.blocs
                .filter((bloc) => bloc.catalogue !== "hidden")
                .map((bloc) => bloc.id)
                .sort(),
        );
        expect(release.exports?.themeTokens).toHaveLength(119);
        expect(release.exports?.assets).toEqual(bundle.assets.map(({ id }) => id));
        const themeEntries = release.theme?.categories.flatMap((category) => category.entries) ?? [];
        expect(themeEntries.filter((entry) => entry.type === "font-face")).toHaveLength(23);
        expect(themeEntries.filter((entry) => entry.type !== "font-face")).toHaveLength(119);
        expect(themeEntries.find((entry) => entry.id === "inter-normal")).toMatchObject({
            asset: "fonts/sans/inter/normal.woff2",
            family: "inter",
            weight: "100 900",
        });
        expect(themeEntries.find((entry) => entry.id === "font-family-main")).toMatchObject({
            defaults: { light: expect.stringContaining('"ulvia-official-inter"') },
        });
        expect(themeEntries.find((entry) => entry.id === "font-family-secondary")).toMatchObject({
            defaults: { light: expect.stringContaining('"ulvia-official-source-serif-4"') },
        });
        expect(release.pages?.some((page) => page.id === "catalog" || page.id === "resources")).toBe(false);
        const action = release.blocs.find((bloc) => bloc.id === "ulvia-official-action");
        expect(action?.kind).toBe("component");
        if (action?.kind === "component") {
            expect(action.runtime?.viewJS).toBeUndefined();
            expect(action.runtime?.styleCSS).toContain('@scope ([cms-bloc="ulvia-official-action"])');
            expect(action.root).toEqual({ accepts: ["button", "a"], defaults: { type: "button" } });
            expect(action.markup).toBe("<slot></slot>");
            expect(action.defaultContent).toBe("{{ cms.i18n.ulvia-official.ui-action-label }}");
            expect(action.settings?.map((setting) => setting.id)).toEqual([
                "variant",
                "tone",
                "size",
                "wide",
                "icon-only",
            ]);
        }
        const heading = release.blocs.find((bloc) => bloc.id === "ulvia-official-heading");
        expect(heading?.kind === "component" ? heading.root?.accepts : undefined).toEqual([
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
        ]);
        expect(heading?.kind === "component" ? heading.slots[""] : undefined).toEqual({
            accepts: [{ kind: "native-content", profile: "phrasing" }],
            min: 1,
        });
        const grid = release.blocs.find((bloc) => bloc.id === "ulvia-official-grid");
        expect(grid?.settings?.find((setting) => setting.id === "columns")).toMatchObject({
            type: "integer",
            minimum: 1,
            maximum: 6,
            default: 3,
        });
        const textIds = new Set(release.texts?.map((entry) => entry.id));
        for (const bloc of release.blocs) {
            for (const html of [bloc.markup, bloc.defaultContent]) {
                for (const match of html?.matchAll(/cms\.i18n\.ulvia-official\.([a-z0-9-]+)/g) ?? []) {
                    expect(textIds.has(match[1]!)).toBeTrue();
                }
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
        expect(firstPage.headers.get("x-request-id")).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
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
}, 30_000);

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
}, 15_000);

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
        };
        const definitionPath = join(sourceRoot, "definition.json");
        await writeFile(definitionPath, JSON.stringify(definition));
        for (const [id, catalogue] of [
            ["asset-example-card", "listed"],
            ["asset-example-card-frame", "hidden"],
        ] as const) {
            const root = join(sourceRoot, "blocs", id);
            await mkdir(root, { recursive: true });
            await writeFile(
                join(root, "definition.json"),
                JSON.stringify({
                    id,
                    kind: "composition",
                    root: { accepts: ["div"] },
                    label: `bloc.${id}.label`,
                    catalogue,
                    slots: {},
                }),
            );
            await writeFile(join(root, "markup.html"), "<p>{{ example.name }}</p>");
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
        await writeFile(
            join(sourceRoot, "assets", "definition.json"),
            JSON.stringify({ generations: { "icons/brand/mark.svg": 2 } }),
        );

        const artifact = await prepareCollectionRelease(sourceRoot);
        expect(artifact.release.assets[0]).toMatchObject({
            id: "icons/brand/mark.svg",
            generation: 2,
            mediaType: "image/svg+xml",
            byteLength: bytes.byteLength,
        });
        expect(artifact.release.assets[0]).not.toHaveProperty("source");
        expect(artifact.release.exports).toEqual({
            blocs: ["asset-example-card"],
            themeTokens: [],
            assets: ["icons/brand/mark.svg"],
        });
        expect(new Uint8Array(await artifact.assets[0]!.bytes.arrayBuffer())).toEqual(bytes);

        const repository = new LocalCollectionRepository(repositoryRoot);
        await repository.store(artifact);
        const server = startTestRepository(repositoryRoot);
        try {
            const remote = new HttpCollectionRepository("local", server.url);
            const bundle = await remote.get((await remote.list())[0]!);
            expect(bundle.release.assets[0]).toEqual(artifact.release.assets[0]);
            expect(bundle.assets).toEqual([{ id: "icons/brand/mark.svg", bytes }]);
            expect((await admitCollectionRelease(bundle.release, bundle.assets)).digest).toBe(artifact.digest);
        } finally {
            server.stop();
        }

        await writeFile(join(sourceRoot, "assets", "icons", "unused.svg"), bytes);
        const withDiscoveredAsset = await prepareCollectionRelease(sourceRoot);
        expect(withDiscoveredAsset.release.assets.map(({ id }) => id)).toEqual([
            "icons/brand/mark.svg",
            "icons/unused.svg",
        ]);
        await unlink(join(sourceRoot, "assets", "icons", "unused.svg"));

        const pageRoot = join(sourceRoot, "pages", "control", "overview");
        await mkdir(pageRoot, { recursive: true });
        await writeFile(join(pageRoot, "definition.json"), JSON.stringify({ id: "overview" }));
        await writeFile(join(pageRoot, "page.html"), "<p>{{ page.title }}</p>");
        await writeFile(join(pageRoot, "unexpected.txt"), "not part of the Page source contract");
        await expect(prepareCollectionRelease(sourceRoot)).rejects.toThrow("must contain exactly");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
