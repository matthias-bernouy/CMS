import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "../../../src/exports/collections/installations";

function release(collectionId: string, version: string, blocId: string, tokenId?: string) {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId,
        publisherId: "atlas.official",
        version,
        name: collectionId,
        locale: "en",
        assets: [],
        blocs: [
            {
                kind: "composition",
                id: blocId,
                label: "Welcome",
                lightdom: "<p>Hello</p>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
        ...(tokenId
            ? {
                  theme: {
                      label: "Theme",
                      categories: [
                          {
                              id: "colors",
                              label: "Colors",
                              tokens: [{ id: tokenId, label: "Accent", type: "color", defaults: { light: "#111111" } }],
                          },
                      ],
                  },
              }
            : {}),
    };
}

test("installations and upgrades reject global Bloc and theme token collisions", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const first = await store.importRelease(release("atlas", "1.0.0", "atlas-tools-card", "tools-accent"));
    await store.install("blocs", first.digest, 0);
    await store.install("themes", first.digest, 0);

    const blocCollision = await store.importRelease(release("atlas-tools", "0.9.0", "atlas-tools-card"));
    await expect(store.install("blocs", blocCollision.digest, 1)).rejects.toThrow("Bloc tag");

    const initialTools = await store.importRelease(release("atlas-tools", "1.0.0", "atlas-tools-welcome"));
    await store.install("themes", initialTools.digest, 1, "local");
    const themeCollision = await store.importRelease(release("atlas-tools", "1.1.0", "atlas-tools-welcome", "accent"));
    await expect(store.upgrade("themes", themeCollision.digest, 2, "local")).rejects.toThrow("theme token");
});
