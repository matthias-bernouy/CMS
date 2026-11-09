import { CollectionStore, MemoryCollectionStorage } from "@bernouy/repository/collections/installations";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { expect, test } from "bun:test";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { mountContentForTest } from "../mount";

test("current Content readers expose all 8,192 texts and theme tokens without weakening retained getters", async () => {
    const artifact = await admitCollectionRelease({
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "publisher/kit",
        publisherId: "publisher",
        version: "1.0.0",
        name: "label",
        locale: "en",
        translations: { en: { label: "Resource", category: "Content", group: "General" } },
        assets: [],
        blocs: [],
        texts: Array.from({ length: 8192 }, (_, id) => ({
            id: `text-${id}`,
            label: "label",
            category: "category",
            group: "group",
            values: { en: "Hello" },
        })),
        theme: {
            label: "label",
            categories: [
                {
                    id: "colors",
                    label: "label",
                    entries: Array.from({ length: 8192 }, (_, id) => ({
                        id: `color-${id}`,
                        label: "label",
                        type: "color",
                        defaults: { light: "#000000" },
                    })),
                },
            ],
        },
    });
    let reads = 0;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    class CountingStore extends CollectionStore {
        override snapshot(siteId: string) {
            expect(siteId).toBe("default");
            reads++;
            return super.snapshot(siteId);
        }
    }
    const collections = new CountingStore(new MemoryCollectionStorage(), new InMemoryReleaseCatalogue());
    await collections.importAdmittedRelease(artifact);
    await collections.install("default", artifact.digest, 0);
    reads = 0;
    await mountContentForTest(dispatcher, { collections });
    const context = {
        requestId: crypto.randomUUID(),
        contractVersion: "1.1.0",
        siteId: "default",
        providerId: "ulvia/primary-provider",
    };
    const input = { collectionId: "publisher/kit" };
    const texts = (await dispatcher.invoke("ulvia/cms.content", "localization.texts.read", input, context)) as {
        items: unknown[];
        groups: { count: number }[];
    };
    expect(texts.items).toHaveLength(8192);
    expect(texts.groups[0]!.count).toBe(8192);
    const theme = (await dispatcher.invoke("ulvia/cms.content", "theme.read", input, context)) as { tokens: unknown[] };
    expect(theme.tokens).toHaveLength(8192);
    expect(reads).toBe(2);
    await expect(dispatcher.invoke("ulvia/cms.content", "localization.texts.get", input, context)).rejects.toThrow();
    await expect(dispatcher.invoke("ulvia/cms.content", "theme.get", input, context)).rejects.toThrow();
});
