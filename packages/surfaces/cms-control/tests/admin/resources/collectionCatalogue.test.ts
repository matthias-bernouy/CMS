import { expect, test } from "bun:test";
import type { CollectionRepositoryEntry } from "@bernouy/cms-repository/collections/sources";
import {
    collectionCatalogueItems,
    renderCollectionCatalogue,
} from "cms-control/components/admin/Resources/Collections/catalogue";

const base: CollectionRepositoryEntry = {
    repositoryId: "local",
    publisherId: "ulvia.examples",
    collectionId: "test",
    version: "1.0.0",
    digest: "a".repeat(64),
    name: "Test",
    description: "Starter collection",
    blocCount: 8,
    hasTheme: true,
};

test("collection catalogue keeps the latest release and reports an upgrade", () => {
    const items = collectionCatalogueItems(
        [base, { ...base, version: "1.1.0", digest: "b".repeat(64) }],
        [
            {
                collectionId: "test",
                publisherId: "ulvia.examples",
                repositoryId: "local",
                version: "1.0.0",
                digest: base.digest,
            },
        ],
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.release.version).toBe("1.1.0");
    expect(items[0]!.state).toBe("upgrade");
});

test("collection catalogue does not offer a cross-publisher upgrade", () => {
    const [item] = collectionCatalogueItems(
        [base],
        [{ collectionId: "test", publisherId: "other", version: "0.9.0", digest: "c".repeat(64) }],
    );
    expect(item!.state).toBe("conflict");
});

test("official collection cards identify Ulvia with the certified badge", () => {
    const host = document.createElement("div");
    const official = {
        ...base,
        publisherId: "ulvia.official",
        collectionId: "ulvia-official",
        name: "Ulvia Official",
    };
    renderCollectionCatalogue(host, [{ release: official, state: "available" }], () => {});

    expect(host.querySelector(".collection-heading p")?.textContent).toBe("By Ulvia");
    expect(host.querySelector("cms-certified-badge")?.getAttribute("aria-label")).toBe(
        "Certified official Ulvia collection",
    );
});
