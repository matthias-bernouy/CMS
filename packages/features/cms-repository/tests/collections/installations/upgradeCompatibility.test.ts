import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "../../../src/exports/collections/installations";
import { collectionDocument } from "../fixtures";

function release(version: string) {
    return {
        ...collectionDocument({
            "theme.category.colors.label": "Colors",
            "theme.label": "Atlas",
            "theme.token.accent.label": "Accent",
            "theme.token.surface.label": "Surface",
        }),
        version,
        theme: {
            label: "theme.label",
            categories: [
                {
                    id: "colors",
                    label: "theme.category.colors.label",
                    tokens: [
                        {
                            id: "accent",
                            label: "theme.token.accent.label",
                            type: "color",
                            defaults: { light: "#123456" },
                        },
                    ],
                },
            ],
        },
    };
}

test("upgrades preserve existing slot contracts and theme token types", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const initial = await store.importRelease(release("1.0.0"));
    await store.install("site", initial.digest, 0, "local");

    const changedSlot = release("1.1.0");
    ((changedSlot.blocs as Record<string, unknown>[])[0]!.slots as Record<string, unknown>).body = { max: 1 };
    const withChangedSlot = await store.importRelease(changedSlot);
    await expect(store.upgrade("site", withChangedSlot.digest, 1, "local")).rejects.toThrow("slot contract");

    const changedToken = release("1.2.0");
    changedToken.theme.categories[0]!.tokens[0]!.type = "value";
    const withChangedToken = await store.importRelease(changedToken);
    await expect(store.upgrade("site", withChangedToken.digest, 1, "local")).rejects.toThrow("theme token");

    const compatible = release("1.3.0");
    compatible.theme.categories[0]!.tokens[0]!.defaults.light = "#654321";
    compatible.theme.categories[0]!.tokens.push({
        id: "surface",
        label: "theme.token.surface.label",
        type: "color",
        defaults: { light: "#ffffff" },
    });
    const admitted = await store.importRelease(compatible);
    await expect(store.upgrade("site", admitted.digest, 1, "local")).resolves.toMatchObject({ revision: 2 });
});
