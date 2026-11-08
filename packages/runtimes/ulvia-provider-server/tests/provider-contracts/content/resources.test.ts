import { withInstalledCollections } from "@bernouy/repository/collections/content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/repository/collections/installations";
import { expect, test } from "bun:test";
import { mkdtemp, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { InMemoryContentRepository } from "@bernouy/content";
import { MemoryResourceMetadataStore } from "@bernouy/resources/memory";
import { ResourceAssets, ResourceTexts, withResourceTexts } from "@bernouy/resources/storage";
import { resourceAssetUrl } from "@bernouy/resources/delivery";
import { readResourceArchive } from "@bernouy/resources";
import { LocalFsBlobStore } from "@bernouy/blob-store/local-fs";
import { NOOP_LOGGER } from "@bernouy/logging";
import { sha256Digest } from "@bernouy/binary-media";
import { createPublicDelivery } from "../../../src/runtime/content/publicDelivery";

async function importedBase(directory: string) {
    const bundled = resolve(import.meta.dir, "../../../dist/bootstrap/resources/ulvia/en.zip");
    const path = join(directory, "base.zip");
    await copyFile(bundled, path);
    const archive = await readResourceArchive(Bun.file(path), {
        expectedDigest: (await Bun.file(bundled + ".sha256").text()).trim(),
    });
    const metadata = new MemoryResourceMetadataStore("instance-a:default");
    const assets = new ResourceAssets(metadata, new LocalFsBlobStore(join(directory, "assets")));
    const texts = new ResourceTexts(metadata);
    const inner = new InMemoryContentRepository();
    for (const { definition, bytes } of archive.assets) {
        const { entry: _entry, ...asset } = definition;
        await assets.putExact(asset, new Uint8Array(await bytes.arrayBuffer()));
    }
    for (const source of archive.document.texts) {
        await texts.createExact(source);
    }
    for (const bloc of archive.document.blocs) {
        await inner.createBloc(bloc);
    }
    const projected = withInstalledCollections(inner, new CollectionStore(new MemoryCollectionStorage()), "default");
    const system = await projected.getSystem();
    await projected.updateSystem({ theme: archive.document.theme!, site: { ...system.site, language: "en" } });
    const icon = archive.document.assets.find((asset) => asset.profiles?.includes("inline-svg"))!;
    const font = archive.document.assets.find((asset) => asset.mediaType === "font/woff2")!;
    const firstText = archive.document.texts[0]!.texts[0]!;
    const expression = `{{ cms.asset.${icon.namespace}.${icon.id} }}`;
    await inner.insertPage(
        "/",
        "Imported resources",
        `<main><p>{{ cms.i18n.ulvia/mossa.${firstText.id} }}</p><svg cms-svg="${expression}"></svg><img src="${expression}" alt="Imported"/></main>`,
    );
    const page = (await inner.getAllPages())[0]!;
    await inner.updatePage({ id: page.id, visible: true }, page.revision);
    await rm(path);
    return { inner, metadata, texts, icon, font, expectedText: firstText.values.en!, path };
}

test("Provider Content renders imported base icons, text and fonts after source ZIP deletion and delivery reconstruction, without any collection lookup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-resource-delivery-"));
    try {
        const imported = await importedBase(directory);
        let legacyReads = 0;
        const mount = () => {
            const assets = new ResourceAssets(imported.metadata, new LocalFsBlobStore(join(directory, "assets")));
            const stores = {
                repo: withInstalledCollections(
                    withResourceTexts(imported.inner, imported.texts),
                    new CollectionStore(new MemoryCollectionStorage()),
                    "default",
                ),
                logger: NOOP_LOGGER,
                resourceStores: { assets },
                executionState: { read: async () => ({ selections: { revision: 0 } }) },
                upgradeStorage: { getActive: async () => null },
                collections: {
                    getInstalledAssetMetadataBatch: async () => {
                        legacyReads++;
                        throw new Error("Legacy collection lookup");
                    },
                },
                providerConnections: {
                    get: async () => {
                        throw new Error("Unexpected downstream call");
                    },
                },
            };
            const gateway = {
                siteId: "default",
                routes: {
                    resolve: async () => {
                        throw new Error("Unexpected capability lookup");
                    },
                },
            };
            const { publicDelivery } = createPublicDelivery(stores as never, gateway as never, "https://site.test");
            const delivery = publicDelivery({ siteId: "default", connectionId: "connection-a" } as never);
            return (path: string, method = "GET", kind: "anonymous" | "administrator" = "anonymous") => {
                const url = new URL(path, "https://site.test");
                return delivery.resolvePath(
                    {
                        path: url.pathname,
                        method,
                        query: [...url.searchParams].map(([name, value]) => ({ name, value })),
                    },
                    { kind },
                );
            };
        };
        expect(await Bun.file(imported.path).exists()).toBe(false);
        for (let restart = 0; restart < 2; restart++) {
            const read = mount();
            const page = await read("/");
            expect(page.status).toBe(200);
            const html = await page.text();
            expect(html).toContain(imported.expectedText);
            expect(html).toContain("<path");
            expect(html).toContain(resourceAssetUrl(imported.icon));
            expect(html).not.toContain("cms.asset.");
            expect(html).not.toContain("cms-svg=");
            const style = await read(/href="(\/_content\/style[^"]+)"/u.exec(html)![1]!);
            expect(style.status).toBe(200);
            const css = await style.text();
            expect(css).toContain("@font-face");
            expect(css).toContain(resourceAssetUrl(imported.font));
            const font = await read(resourceAssetUrl(imported.font));
            expect(font.status).toBe(200);
            expect(font.headers.get("content-type")).toBe("font/woff2");
            expect(font.headers.get("content-disposition")).toBe("inline");
            expect(await sha256Digest(new Uint8Array(await font.arrayBuffer()))).toBe(imported.font.digest);
            expect((await read(resourceAssetUrl(imported.font), "HEAD")).body).toBeNull();
            const privateAsset = await read(resourceAssetUrl(imported.font), "HEAD", "administrator");
            expect(privateAsset.headers.get("cache-control")).toBe("private, no-store");
            expect(await (await read("/robots.txt")).text()).toContain("Allow: /_content/resources/");
        }
        expect(legacyReads).toBe(0);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}, 10000);
