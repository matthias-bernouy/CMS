import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HttpCollectionRepository } from "@bernouy/repository/collections/http";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { LocalCollectionRepository } from "@bernouy/repository/repository/filesystem";
import { prepareCollectionRelease } from "@bernouy/repository/collections/build";
import { startTestRepository } from "../repository/fixture";
import { officialContractCatalogue } from "../officialContractCatalogue";
import { isValidRequestId, REQUEST_ID_HEADER } from "@bernouy/http-runner/observability";

test("local repository lists immutable metadata and serves matching release bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia--repository--"));
    const repository = new LocalCollectionRepository(root);
    const server = startTestRepository(root);
    try {
        const contracts = await officialContractCatalogue();
        const source = new HttpCollectionRepository("local", server.url);
        expect(await source.list()).toEqual([]);
        const missing = await fetch(
            `${server.url}/.cms/call/ulvia/repository/v1/releases/collection/missing/test/1.0.0`,
        );
        expect(isValidRequestId(missing.headers.get(REQUEST_ID_HEADER) ?? "")).toBe(true);
        const artifact = await prepareCollectionRelease(
            resolve(import.meta.dir, "../stack/fixtures/smoke-kit"),
            contracts,
        );
        const version = artifact.release.version;
        expect(await repository.store(artifact)).toBe(true);
        expect(await repository.store(artifact)).toBe(false);
        server.application.index.invalidate();
        const entries = await source.list();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            publisherId: "ulvia.test",
            collectionId: "ulvia.test/smoke-kit",
            version,
            hasTheme: false,
        });
        const bundle = await source.get(entries[0]!);
        expect((await admitCollectionRelease(bundle.release, bundle.assets, { contracts })).digest).toBe(
            entries[0]!.digest,
        );
        expect(bundle.assets.map(({ id }) => id)).toEqual(
            [...bundle.assets.map(({ id }) => id)].sort((left, right) => left.localeCompare(right)),
        );
        expect(bundle.assets).toHaveLength(artifact.assets.length);
        expect(entries[0]?.blocCount).toBe(bundle.release.blocs.length);
        expect(bundle.release.exports?.blocs).toEqual(["ulvia-dtest--smoke-kit--card"]);
        expect(
            (await fetch(`${server.url}/.cms/call/ulvia/repository/v1/releases/collection/missing/test/${version}`))
                .status,
        ).toBe(404);
        const assets = artifact.assets.map(({ id, bytes }) => ({ id, bytes }));
        const build = await admitCollectionRelease({ ...artifact.release, version: "1.3.3+build.1" }, assets, {
            contracts,
        });
        await repository.store(build);
        server.application.index.invalidate();
        const page = (input: Record<string, unknown>) =>
            fetch(`${server.url}/.cms/call/ulvia/repository/v1/catalogue`, {
                method: "QUERY",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kind: "collection", ...input }),
            });
        const firstPage = await page({ limit: 1 });
        expect(firstPage.status).toBe(200);
        expect(firstPage.headers.get("x-request-id")).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        const firstPageBody = (await firstPage.json()) as { releases: unknown[]; nextCursor?: string };
        expect(firstPageBody.releases).toHaveLength(1);
        expect(firstPageBody.nextCursor).toBeString();
        const secondPage = await page({ limit: 1, cursor: firstPageBody.nextCursor });
        expect(secondPage.status).toBe(200);
        expect(((await secondPage.json()) as { releases: unknown[] }).releases).toHaveLength(1);
        expect((await page({ limit: 0 })).status).toBe(400);
        expect((await page({ unknown: true })).status).toBe(400);
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
        server.application.index.invalidate();
        expect(await source.list()).toEqual([]);
        expect(
            (
                await fetch(
                    `${server.url}/.cms/call/ulvia/repository/v1/releases/collection/ulvia.test/ulvia.test%2Fsmoke-kit/${version}`,
                )
            ).status,
        ).toBe(404);
    } finally {
        await server.stop();
        await rm(root, { recursive: true, force: true });
    }
}, 30_000);

test("a release coordinate cannot be replaced with different content", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia--repository--"));
    try {
        const repository = new LocalCollectionRepository(root);
        const artifact = await prepareCollectionRelease(
            resolve(import.meta.dir, "../stack/fixtures/smoke-kit"),
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
        await expect(repository.store(changed)).rejects.toMatchObject({ publicationCode: "immutable_conflict" });
        expect((await repository.get("ulvia.test", "ulvia.test/smoke-kit", artifact.release.version))?.digest).toBe(
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
            collectionId: "ulvia/asset-example",
            publisherId: "ulvia",
            version: "1.0.0",
            name: "collection.name",
            locale: "en",
            exports: "*",
        };
        const definitionPath = join(sourceRoot, "definition.json");
        await writeFile(definitionPath, JSON.stringify(definition));
        for (const [id, catalogue] of [
            ["ulvia--asset-example--card", "listed"],
            ["ulvia--asset-example--card-frame", "hidden"],
        ] as const) {
            const root = join(sourceRoot, "blocs", id);
            await mkdir(root, { recursive: true });
            await writeFile(
                join(root, "definition.json"),
                JSON.stringify({
                    description: `bloc.${id.replaceAll("--", ".")}.label`,
                    categories: [`bloc.${id.replaceAll("--", ".")}.label`],

                    id,
                    kind: "composition",
                    root: { accepts: ["div"] },
                    label: `bloc.${id.replaceAll("--", ".")}.label`,
                    catalogue,
                    ...(catalogue === "listed" ? { examples: ["card"], defaultExample: "card" } : {}),
                    slots: {},
                }),
            );
            await writeFile(join(root, "markup.html"), "<p>{{ example.name }}</p>");
        }
        await mkdir(join(sourceRoot, "examples", "card"), { recursive: true });
        await writeFile(
            join(sourceRoot, "examples", "card", "definition.json"),
            JSON.stringify({
                id: "card",
                label: "bloc.ulvia.asset-example.card.label",
                description: "bloc.ulvia.asset-example.card.label",
                previews: [{ id: "desktop", frame: { width: 640, height: 240 } }],
            }),
        );
        await writeFile(
            join(sourceRoot, "examples", "card", "document.html"),
            '<div cms-bloc="ulvia--asset-example--card"></div>',
        );
        await writeFile(
            join(sourceRoot, "translations", "en", "collection.json"),
            JSON.stringify({
                "collection.name": "Asset example",
                "asset.retired": "Use a newer illustration",
                "bloc.ulvia.asset-example.card.label": "Card",
                "bloc.ulvia.asset-example.card-frame.label": "Card frame",
            }),
        );
        await writeFile(join(sourceRoot, "assets", "icons", "brand", "mark.svg"), bytes);
        await writeFile(
            join(sourceRoot, "assets", "definition.json"),
            JSON.stringify({ deprecations: { "icons/brand/mark.svg": { reason: "asset.retired" } } }),
        );

        const artifact = await prepareCollectionRelease(sourceRoot);
        expect(artifact.release.assets[0]).toMatchObject({
            id: "icons/brand/mark.svg",
            deprecation: { reason: "asset.retired" },
            mediaType: "image/svg+xml",
            byteLength: bytes.byteLength,
        });
        expect(artifact.release.assets[0]).not.toHaveProperty("source");
        expect(artifact.release.exports).toEqual({
            blocs: ["ulvia--asset-example--card"],
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
            await server.stop();
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
        await expect(prepareCollectionRelease(sourceRoot)).rejects.toThrow("Unknown collection source directory");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
