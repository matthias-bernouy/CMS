import { InMemorySurfacePageRouteRegistry, synchronizeCollectionPageRoutes } from "@bernouy/cms-content";

export async function controlPageCollections() {
    const collections = {
        siteId: "site-a",
        routes: new InMemorySurfacePageRouteRegistry(),
        store: {
            snapshot: async () => ({
                revision: 1,
                collections: [
                    {
                        collectionId: "official",
                        digest: `sha256:${"c".repeat(64)}`,
                        configuration: {},
                        textOverrides: {},
                        release: {
                            publisherId: "ulvia.official",
                            collectionId: "official",
                            version: "1.0.0",
                            pages: [
                                {
                                    id: "pages",
                                    generation: 1,
                                    surface: "control",
                                    defaultPath: "/admin",
                                    uses: [],
                                    requires: [
                                        {
                                            contractId: "catalog",
                                            capabilityId: "item.list",
                                            versionRange: "^1.0.0",
                                        },
                                    ],
                                    document: { html: "<main></main>" },
                                },
                            ],
                            blocs: [],
                        },
                    },
                ],
            }),
        },
    };
    await synchronizeCollectionPageRoutes(collections.routes, (await collections.store.snapshot()) as never);
    return collections;
}
