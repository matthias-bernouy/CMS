import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { sha256Digest } from "@bernouy/binary-media";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/content";
import { MemorySiteUpgradeStorage } from "@bernouy/repository/upgrades";
import { MemoryResourceMetadataStore, MemoryResourceInitializationStateStore } from "../../src/exports/memory";
import { ResourceAssets, ResourceTexts } from "../../src/exports/storage";
import { readResourceArchive, writeResourceArchive } from "../../src/exports";
import {
    ResourceInitializationService,
    copyResourceContent,
    emptyResourceProgress,
} from "../../src/exports/initialization";
import type { ResourceInitializationOptions, ResourceInitializationGuard } from "../../src/exports/initialization";
import { blocFixture, documentFixture } from "../fixtures";

export async function baseArchive(browser = false) {
    const bytes = new TextEncoder().encode("base asset");
    const document = documentFixture();
    return writeResourceArchive({
        document: {
            ...document,
            blocs: [blocFixture(browser ? { viewJS: "function init() {}" } : {})],
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
            assets: [
                {
                    namespace: "acme/base",
                    id: "file.txt",
                    entry: "assets/file.txt",
                    mediaType: "text/plain",
                    byteLength: bytes.length,
                    digest: await sha256Digest(bytes),
                },
            ],
            pages: [
                {
                    path: "/",
                    title: "Home",
                    description: "Base home",
                    html: '<div cms-bloc="sample-card"></div>',
                    visible: true,
                    indexing: true,
                },
                {
                    path: "/login",
                    title: "Login",
                    description: "Login page",
                    html: '<div cms-bloc="sample-card"></div>',
                    visible: false,
                    indexing: false,
                    systemRole: "login",
                },
            ],
        },
        assets: [{ path: "assets/file.txt", bytes }],
    });
}
export function copyPorts(scope = "instance-a:site-a") {
    const raw = new InMemoryContentRepository();
    const content = new ValidatingContentRepository(raw);
    const metadata = new MemoryResourceMetadataStore(scope);
    const blobs = new MemoryBlobStore();
    const assets = new ResourceAssets(metadata, blobs);
    const texts = new ResourceTexts(metadata);
    return { raw, content, metadata, blobs, assets, texts, createBloc: raw.createBloc.bind(raw) };
}
export function workerGuard(controller = new AbortController()): ResourceInitializationGuard {
    return { signal: controller.signal, assertHeld: () => controller.signal.throwIfAborted() };
}
export async function initializationFixture(browser = false) {
    const archive = await baseArchive(browser);
    const ports = copyPorts();
    const state = new MemoryResourceInitializationStateStore("instance-a", "site-a");
    await state.initialize();
    const intents = new MemorySiteUpgradeStorage();
    const retained = new Map<string, Blob>();
    const calls = { authorization: 0, source: 0, verification: 0, receipt: 0 };
    const authority = { allowed: true };
    const options: { -readonly [Key in keyof ResourceInitializationOptions]: ResourceInitializationOptions[Key] } = {
        ...ports,
        state,
        intents,
        instanceId: "instance-a",
        siteId: "site-a",
        retained: {
            put: async (digest, bytes) => {
                retained.set(digest, bytes);
            },
            get: async (digest) => retained.get(digest) ?? null,
            remove: async (digest) => {
                retained.delete(digest);
            },
        },
        authorize: async (actor) => {
            calls.authorization++;
            if (!authority.allowed || actor !== "admin") {
                throw Object.assign(new Error("not authorized"), { status: 403 });
            }
        },
        execution: async () => ({ fingerprint: "selected-v1", selected: [], denied: [] }),
        source: async () => {
            calls.source++;
            return { digest: archive.digest, bytes: archive.bytes };
        },
        verify: async (bytes, expectedDigest, signal) => {
            calls.verification++;
            return readResourceArchive(bytes, { expectedDigest, signal });
        },
        preview: async (candidate, _execution, system, signal) => {
            const preview = copyPorts("preview:site");
            await preview.raw.updateSystem(system);
            const copied = await copyResourceContent(
                candidate,
                preview,
                {
                    initial: emptyResourceProgress(),
                    signal,
                    assertHeld: async () => signal.throwIfAborted(),
                    checkpoint: async () => {},
                },
                null,
            );
            return { requirements: [], pages: copied.pages, themeDigest: copied.themeDigest };
        },
        now: () => new Date("2026-11-08T12:00:00.000Z"),
    };
    const get = intents.get.bind(intents);
    intents.get = async <Payload>(siteId: string, id: string, kind: string) => {
        calls.receipt++;
        return get<Payload>(siteId, id, kind);
    };
    const service = new ResourceInitializationService(options);
    return { archive, ...ports, options, state, service, intents, retained, calls, authority };
}
