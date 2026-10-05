import { describe, expect, test } from "bun:test";
import { parseCollectionCatalogue, parseCollectionCataloguePage } from "../../src/collections/sources/parseCatalogue";
import { parseProviderCatalogue, parseProviderCataloguePage } from "../../src/providers/sources/parseCatalogue";
import { readCataloguePages } from "../../src/repository-http/cataloguePages";

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

    test("accepts bounded opaque cursors and rejects malformed page envelopes", () => {
        expect(parseCollectionCataloguePage({ releases: [], nextCursor: "page_2" }, "official").nextCursor).toBe(
            "page_2",
        );
        expect(
            parseProviderCataloguePage({ releases: [], nextCursor: "page-2" }, "official", "contract").nextCursor,
        ).toBe("page-2");
        for (const nextCursor of ["", "has padding=", "has spaces", "x".repeat(1_025)]) {
            expect(() => parseCollectionCataloguePage({ releases: [], nextCursor }, "official")).toThrow();
        }
    });

    test("consumes pages while rejecting cursor loops and cross-page duplicates", async () => {
        const pages = new Map([
            [undefined, { entries: [{ id: "one" }], nextCursor: "second" }],
            ["second", { entries: [{ id: "two" }] }],
        ]);
        await expect(
            readCataloguePages(
                (cursor) => Promise.resolve(pages.get(cursor)!),
                (entry) => entry.id,
                "test",
            ),
        ).resolves.toEqual([{ id: "one" }, { id: "two" }]);
        await expect(
            readCataloguePages(
                (cursor) =>
                    Promise.resolve(
                        cursor ? { entries: [{ id: "one" }] } : { entries: [{ id: "one" }], nextCursor: "next" },
                    ),
                (entry) => entry.id,
                "test",
            ),
        ).rejects.toThrow("Duplicate");
        await expect(
            readCataloguePages(
                () => Promise.resolve({ entries: [{ id: "one" }], nextCursor: "same" }),
                (entry) => entry.id,
                "test",
            ),
        ).rejects.toThrow();
    });
});
