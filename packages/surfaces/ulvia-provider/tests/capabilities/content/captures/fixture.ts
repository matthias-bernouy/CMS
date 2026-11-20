import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { MemoryCaptureArtifacts } from "@bernouy/browser-capture";
import { createIsolatedCaptureEngine } from "@bernouy/browser-capture/playwright";
import { createUnixCaptureClient } from "@bernouy/browser-capture/unix/client";
import { startUnixCaptureWorker } from "@bernouy/browser-capture/unix/server";
import { InMemoryContentRepository } from "@bernouy/content";
import { ContentDelivery } from "@bernouy/content/public-delivery";
import { createContentReader } from "@bernouy/content/rendering";
import { InMemoryCache } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/repository/collections/installations";
import { withInstalledCollections } from "@bernouy/repository/collections/content";
import { installedExampleCaptureDocument } from "@bernouy/repository/collections/build";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { contentTransport } from "../transport";

export async function captureFixture() {
    const collection = await admitCollectionRelease({
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "proof/ui",
        publisherId: "proof",
        version: "1.0.0",
        name: "name",
        locale: "en",
        translations: { en: { name: "Capture proof" } },
        assets: [],
        blocs: [
            {
                id: "proof--ui--panel",
                kind: "component",
                label: "name",
                description: "name",
                categories: ["name"],
                examples: ["sample"],
                defaultExample: "sample",
                root: { accepts: ["div"] },
                markup: "<slot></slot>",
                slots: { default: { accepts: [{ kind: "native-content", profile: "prose" }], min: 1 } },
            },
        ],
        examples: [
            {
                id: "sample",
                label: "name",
                description: "name",
                document: { html: `<div cms-bloc="proof--ui--panel"><p>${"OVERFLOW".repeat(80)}</p></div>` },
                previews: [
                    { id: "desktop", frame: { width: 960, height: 540 } },
                    { id: "mobile", frame: { width: 390, height: 600 } },
                ],
            },
        ],
    });
    const collections = new CollectionStore(new MemoryCollectionStorage());
    await collections.importAdmittedRelease(collection);
    await collections.install("default", collection.digest, 0);
    const repo = withInstalledCollections(new InMemoryContentRepository(), collections, "default");
    const delivery = new ContentDelivery({
        content: createContentReader(repo),
        cache: new InMemoryCache(),
        logger: NOOP_LOGGER,
        publicUrl: "https://site.test",
        resolveContributedAssets: async (value) => value,
        serveCollectionAsset: async () => new Response(null, { status: 404 }),
    });
    const root = await mkdtemp(resolve(tmpdir(), "ulvia-mcp-worker-"));
    const socket = resolve(root, "worker.sock");
    const worker = await startUnixCaptureWorker(
        socket,
        createIsolatedCaptureEngine({
            bunPath: process.execPath,
            browserPath: chromium.executablePath(),
            modulesPath: resolve("node_modules"),
            sandboxPath: "/usr/bin/bwrap",
        }),
    );
    const engine = createUnixCaptureClient(socket);
    const transport = await contentTransport({
        repo,
        collections,
        publicDelivery: () => delivery,
        captures: {
            run: async (work) => work(),
            engine,
            artifacts: new MemoryCaptureArtifacts(),
            revision: async () => String(await repo.getSystemRevision()),
            pageDocument: (page, input, context) =>
                delivery.captureDocument(page, input.locale, input.options.themeMode, context.signal),
            exampleDocument: (input, context) => installedExampleCaptureDocument(collections, context.siteId, input),
        },
    });
    return {
        ...transport,
        collection,
        close: async () => {
            await worker.stop();
            await rm(root, { recursive: true, force: true });
        },
    };
}
