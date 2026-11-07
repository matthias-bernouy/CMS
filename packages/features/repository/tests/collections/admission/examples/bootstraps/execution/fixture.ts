import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/content";
import {
    admitCollectionRelease,
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
} from "@bernouy/repository/collections";
import { withInstalledCollections } from "@bernouy/repository/collections/content";
import {
    SiteInitializationService,
    applyInitializationPages,
    CollectionStore,
    MemoryCollectionStorage,
} from "@bernouy/repository/collections/installations";
import type {
    InitializationRecord,
    InitializationStateStore,
    InitializationServiceOptions,
} from "@bernouy/repository/collections/installations";
import { MemorySiteUpgradeStorage, withSiteWriteFence } from "@bernouy/repository/upgrades";
import { bootstrapCollection } from "../fixture";

export async function initializationFixture(instanceId = "instance-a", pages = 1) {
    const source = bootstrapCollection();
    for (let index = 1; index < pages; index++) {
        source.bootstraps[0].pages.push({
            ...source.bootstraps[0].pages[0],
            id: `page-${index}`,
            path: `/page-${index}`,
        });
    }
    const artifact = await admitCollectionRelease(source);
    const root = {
        publisherId: artifact.release.publisherId,
        collectionId: artifact.release.collectionId,
        version: artifact.release.version,
        digest: artifact.digest,
        bootstrapId: "admin",
    };
    const records = new Map<string, InitializationRecord>();
    const model = { list: 0, metadata: 0, bundles: 0, fault: (_name: string, _args: unknown[]) => {} };
    function observed<T extends object>(target: T, names: string[]): T {
        return new Proxy(target, {
            get(current, property) {
                const value = Reflect.get(current, property, current);
                if (typeof value !== "function") {
                    return value;
                }
                return async (...args: unknown[]) => {
                    const result = await Reflect.apply(value, current, args);
                    if (names.includes(String(property))) {
                        model.fault(String(property), args);
                    }
                    return result;
                };
            },
        });
    }
    const state = observed<InitializationStateStore>(
        {
            async initialize(siteId) {
                if (!records.has(siteId)) {
                    records.set(siteId, {
                        protocol: "ulvia-site-initialization/v1",
                        siteId,
                        revision: 0,
                        status: "pending",
                        review: null,
                        pageIds: {},
                        completedPages: [],
                    });
                }
            },
            async read(siteId) {
                return structuredClone(records.get(siteId) ?? null);
            },
            async replace(record, expectedRevision) {
                if (records.get(record.siteId)?.revision !== expectedRevision) {
                    throw new Error("Revision conflict");
                }
                records.set(record.siteId, structuredClone(record));
            },
        },
        ["replace"],
    );
    await state.initialize("default");
    const upgrades = observed(new MemorySiteUpgradeStorage(), ["transition"]);
    const collections = observed(new CollectionStore(new MemoryCollectionStorage()), ["installMany"]);
    const raw = new ValidatingContentRepository(
        withInstalledCollections(new InMemoryContentRepository(), collections, "default"),
    );
    const repository = observed(raw, ["insertPage", "updatePage"]);
    const options: InitializationServiceOptions = {
        instanceId,
        siteId: "default",
        state,
        upgrades,
        collections,
        repository,
        execution: async () => ({ selected: [], denied: [], fingerprint: "selected-v1" }),
        source: {
            id: "local",
            async list() {
                model.list++;
                const risk = collectionBrowserRisk(artifact.release);
                return [
                    {
                        ...root,
                        repositoryId: "local",
                        name: artifact.release.name,
                        description: "",
                        blocCount: artifact.release.blocs.length,
                        hasTheme: false,
                        browserRisk: risk.level,
                        browserRiskDigest: collectionBrowserRiskDigest(risk),
                        javaScriptBlocCount: 0,
                        frameBlocCount: 0,
                        externalFrameOrigins: [],
                        scriptsWithSameOrigin: false,
                    },
                ];
            },
            async getMetadata() {
                model.metadata++;
                return artifact.release;
            },
            async get() {
                model.bundles++;
                return { release: artifact.release, assets: [] };
            },
        },
        async validateCandidate(plan, artifacts) {
            const store = new CollectionStore(new MemoryCollectionStorage());
            for (const artifact of artifacts) {
                await store.importAdmittedRelease(artifact);
            }
            if (artifacts.length) {
                await store.installMany(
                    "default",
                    artifacts.map(({ digest }) => ({ digest })),
                    0,
                );
            }
            const preview = new ValidatingContentRepository(
                withInstalledCollections(new InMemoryContentRepository(), store, "default"),
            );
            await applyInitializationPages(
                preview,
                plan,
                artifacts.map(({ release }) => release),
                {
                    pageIds: {},
                    completedPages: [],
                    checkpoint: async () => {},
                    assertLease: async () => {},
                },
            );
        },
    };
    return {
        service: new SiteInitializationService(options),
        options,
        state,
        raw,
        records,
        root,
        artifact,
        model,
        guarded: withSiteWriteFence(raw, upgrades, "default", ["insertPage", "updatePage", "deletePage"]),
    };
}
