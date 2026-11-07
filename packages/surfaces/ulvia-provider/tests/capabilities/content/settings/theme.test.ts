import { expect, test } from "bun:test";
import { defaultSystem } from "@bernouy/cms-content";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { mountContentForTest } from "../mount";

const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia/primary-provider",
};

test("theme reads compose the authoritative token catalogues from installed collections", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const system = defaultSystem();
    system.site.language = "fr";
    await mountContentForTest(dispatcher, {
        repo: {
            getSystemRevision: async () => 3,
            getSystem: async () => structuredClone(system),
            updateSystem: async (update: { theme: typeof system.theme }, expectedRevision: number) => {
                expect(expectedRevision).toBe(3);
                system.theme = structuredClone(update.theme);
                return structuredClone(system);
            },
        },
        collections: {
            snapshot: async () => ({
                revision: 5,
                collections: [
                    {
                        collectionId: "example.publisher/example",
                        textOverrides: {},
                        release: {
                            collectionId: "example.publisher/example",
                            publisherId: "example.publisher",
                            version: "1.0.0",
                            locale: "fr",
                            translations: {
                                fr: {
                                    "theme.label": "Thème exemple",
                                    "category.colors": "Couleurs",
                                    "token.primary": "Primaire",
                                },
                            },
                            assets: [],
                            blocs: [],
                            theme: {
                                label: "theme.label",
                                categories: [
                                    {
                                        id: "colors",
                                        label: "category.colors",
                                        entries: [
                                            {
                                                id: "primary",
                                                label: "token.primary",
                                                type: "color",
                                                defaults: { light: "#3b5ccc", dark: "#9bb1ff" },
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                ],
            }),
        },
    } as never);

    const output = await dispatcher.invoke(
        "ulvia/cms.content",
        "theme.get",
        { collectionId: "example.publisher/example" },
        context,
    );
    expect(output).toMatchObject({
        revision: 3,
        collectionId: "example.publisher/example",
        sourceFound: true,
        sourceLabel: "Thème exemple",
        profileId: "default",
        mode: "light",
        token: {
            id: "example-dpublisher--example--primary",
            label: "Primaire",
            categoryLabel: "Couleurs",
            value: "#3b5ccc",
            overridden: false,
        },
    });

    const saved = await dispatcher.invoke(
        "ulvia/cms.content",
        "theme.token.save",
        {
            expectedRevision: 3,
            themeId: "default",
            mode: "light",
            tokenId: "example-dpublisher--example--primary",
            value: "#123456",
        },
        context,
    );
    expect(saved).toMatchObject({ value: "#123456", overridden: true });
    expect(system.theme.themes[0]!.values.light["example-dpublisher--example--primary"]).toBe("#123456");
});
