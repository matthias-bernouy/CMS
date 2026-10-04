import { describe, expect, test } from "bun:test";
import { parseCollectionCatalogue } from "../../src/collections/sources/parseCatalogue";
import { parseProviderCatalogue } from "../../src/providers/sources/parseCatalogue";

const digest = `sha256:${"0".repeat(64)}`;

function providerEntry() {
    return {
        publisherId: "acme.official",
        providerId: "commerce.stripe",
        version: "1.0.0",
        digest,
        name: "Stripe",
    };
}

function collectionEntry() {
    return {
        publisherId: "acme.official",
        collectionId: "storefront",
        version: "1.0.0",
        digest,
        name: "Storefront",
        description: "Commerce components",
        blocCount: 4,
        hasTheme: true,
    };
}

describe("repository catalogue boundaries", () => {
    test("provider entries use canonical artifact identities and exact fields", () => {
        expect(parseProviderCatalogue({ releases: [providerEntry()] }, "official", "provider-manifest")).toHaveLength(
            1,
        );
        for (const patch of [
            { publisherId: "acme.2" },
            { providerId: "commerce.2" },
            { version: "01.0.0" },
            { name: "" },
            { extra: true },
        ]) {
            expect(() =>
                parseProviderCatalogue(
                    { releases: [{ ...providerEntry(), ...patch }] },
                    "official",
                    "provider-manifest",
                ),
            ).toThrow();
        }
        expect(() =>
            parseProviderCatalogue({ releases: [providerEntry()], extra: true }, "official", "provider-manifest"),
        ).toThrow();
    });

    test("collection entries use canonical versions and exact fields", () => {
        expect(parseCollectionCatalogue({ releases: [collectionEntry()] }, "official")).toHaveLength(1);
        for (const patch of [{ version: "01.0.0" }, { name: "" }, { collectionId: "cms-tools" }, { extra: true }]) {
            expect(() =>
                parseCollectionCatalogue({ releases: [{ ...collectionEntry(), ...patch }] }, "official"),
            ).toThrow();
        }
        expect(() => parseCollectionCatalogue({ releases: [collectionEntry()], extra: true }, "official")).toThrow();
    });

    test("collection dashboard summaries follow the collection admission ceiling", () => {
        const dashboard = (index: number) => ({
            id: `dashboard-${index}`,
            name: `Dashboard ${index}`,
            description: "",
            viewCount: 1,
        });
        expect(
            parseCollectionCatalogue(
                {
                    releases: [
                        {
                            ...collectionEntry(),
                            dashboards: Array.from({ length: 128 }, (_, index) => dashboard(index)),
                        },
                    ],
                },
                "official",
            )[0]!.dashboards,
        ).toHaveLength(128);
        expect(() =>
            parseCollectionCatalogue(
                {
                    releases: [
                        {
                            ...collectionEntry(),
                            dashboards: Array.from({ length: 129 }, (_, index) => dashboard(index)),
                        },
                    ],
                },
                "official",
            ),
        ).toThrow("dashboard summaries");
    });

    test("rejects ambiguous release coordinates in both catalogues", () => {
        expect(() =>
            parseProviderCatalogue(
                { releases: [providerEntry(), { ...providerEntry(), digest: `sha256:${"1".repeat(64)}` }] },
                "official",
                "provider-manifest",
            ),
        ).toThrow("Duplicate");
        expect(() =>
            parseCollectionCatalogue(
                { releases: [collectionEntry(), { ...collectionEntry(), digest: `sha256:${"1".repeat(64)}` }] },
                "official",
            ),
        ).toThrow("Duplicate");
    });
});
