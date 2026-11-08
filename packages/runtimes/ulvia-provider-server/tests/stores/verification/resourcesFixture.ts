import { validateBlocWrite, InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/content";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { sha256Digest } from "@bernouy/binary-media";
import { writeResourceArchive } from "@bernouy/resources";
import { ResourceAssets, ResourceTexts, withResourceTexts } from "@bernouy/resources/storage";
import { MemoryResourceMetadataStore, MemoryResourceInitializationStateStore } from "@bernouy/resources/memory";
import { MemorySiteUpgradeStorage } from "@bernouy/repository/upgrades";
import type { ResourceInitializationOptions } from "@bernouy/resources/initialization";
import type { HostPreparationPool } from "../../../src/runtime/instances/verification/HostPreparationPool";

export async function archiveFixture() {
    const asset = new TextEncoder().encode("resource bytes");
    const bloc = JSON.parse(
        JSON.stringify(
            validateBlocWrite({
                id: "sample-card",
                kind: "component",
                name: "Card",
                group: "Base",
                description: "Card",
                root: { accepts: ["div"] },
                markupHTML: "<slot></slot>",
                viewJS: "throw new Error('Authored JavaScript must never execute')",
                ownership: { kind: "code-managed" },
            }),
        ),
    );
    return writeResourceArchive({
        document: {
            format: "ulvia-resources/v1",
            blocs: [bloc],
            theme: null,
            assets: [
                {
                    namespace: "acme/base",
                    id: "file.txt",
                    entry: "assets/file.txt",
                    mediaType: "text/plain",
                    byteLength: asset.length,
                    digest: await sha256Digest(asset),
                },
            ],
            texts: [
                {
                    namespace: "acme/base",
                    locale: "en",
                    texts: [
                        {
                            id: "hello",
                            category: "Base",
                            group: "Base",
                            label: "Hello",
                            values: { en: "Hello", fr: "Bonjour" },
                        },
                    ],
                },
            ],
            pages: [
                {
                    path: "/",
                    title: "Home",
                    description: "Home",
                    html: '<div cms-bloc="sample-card"></div>',
                    visible: true,
                    indexing: true,
                },
            ],
        },
        assets: [{ path: "assets/file.txt", bytes: asset }],
    });
}
export async function initializationFixture(pool: HostPreparationPool) {
    const archive = await archiveFixture();
    const raw = new InMemoryContentRepository();
    const metadata = new MemoryResourceMetadataStore("instance-a:default");
    const texts = new ResourceTexts(metadata);
    const state = new MemoryResourceInitializationStateStore("instance-a", "default");
    await state.initialize();
    const retained = new Map<string, Blob>();
    const options: ResourceInitializationOptions = {
        instanceId: "instance-a",
        siteId: "default",
        state,
        content: new ValidatingContentRepository(withResourceTexts(raw, texts)),
        createBloc: raw.createBloc.bind(raw),
        metadata,
        assets: new ResourceAssets(metadata, new MemoryBlobStore()),
        texts,
        intents: new MemorySiteUpgradeStorage(),
        retained: {
            put: async (key, bytes) => {
                retained.set(key, bytes);
            },
            get: async (key) => retained.get(key) ?? null,
            remove: async (key) => {
                retained.delete(key);
            },
        },
        authorize: async (actor) => {
            if (actor !== "admin") {
                throw new Error("Administrator required");
            }
        },
        execution: async () => ({ fingerprint: "selected", selected: [], denied: [] }),
        source: async () => ({ digest: archive.digest, bytes: archive.bytes }),
        ...pool.resources,
        now: () => new Date(),
    };
    return { archive, raw, metadata, texts, state, retained, options };
}
