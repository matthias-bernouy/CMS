import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/cms-content";
import {
    CollectionStore,
    MemoryCollectionStorage,
    collectionUsageInventory,
    siteUsageInventory,
} from "@bernouy/cms-repository/collections/installations";
import { parseCollectionRelease } from "@bernouy/cms-repository/collections";
import { documentReferences } from "../../../../src/collections/installations/upgrades/usage/scan";
import { collectionPageBatches } from "../../../../src/collections/installations/upgrades/usage/pageScan";
import { collectionDocument } from "../../fixtures";

test("demonstrations and catalogue resources alone do not request runtime execution grants", () => {
    const release = parseCollectionRelease(collectionDocument());
    const requirement = { contractId: "catalog", capabilityId: "list", versionRange: "^1.0.0" };
    const references = collectionUsageInventory([
        {
            ...release,
            exports: { blocs: ["atlas-panel"], themeTokens: [] },
            blocs: release.blocs.map((bloc) => ({ ...bloc, requires: [requirement] })),
            examples: [
                { ...release.examples![0]!, document: { html: '<div cms-query="catalog:list as items"></div>' } },
            ],
        },
    ]);
    expect(references.some((reference) => reference.type === "capability")).toBe(true);
    expect(
        references
            .filter((reference) => reference.type === "capability")
            .every((reference) => reference.scope === "catalogue"),
    ).toBe(true);
    expect(references).toContainEqual(
        expect.objectContaining({ location: "collection:atlas/exports/blocs/atlas-panel", scope: "catalogue" }),
    );
});

test("token ownership and state references use exact identities with overlapping collection prefixes", () => {
    const base = parseCollectionRelease(collectionDocument());
    const releases = [
        {
            ...base,
            collectionId: "atlas",
            states: [{ id: "menu", scope: "page" as const, schema: { type: "boolean" as const } }],
        },
        { ...base, collectionId: "atlas-ui", states: [] },
    ];
    const references = documentReferences(
        "var(--atlas-ui-accent) @page:atlas-menu-open",
        "page:one",
        "runtime",
        releases,
    );
    expect(references).toContainEqual({
        type: "resource",
        kind: "theme-token",
        collectionId: "atlas-ui",
        id: "accent",
        location: "page:one",
        scope: "runtime",
    });
    expect(references.some((reference) => reference.type === "resource" && reference.kind === "state")).toBe(false);
});

test("contributor failures and changing revisions keep the inventory incomplete", async () => {
    const repository = new InMemoryContentRepository();
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const failing = await siteUsageInventory(
        repository,
        collections,
        "site",
        [
            {
                id: "internal",
                snapshot: async () => {
                    throw new Error("Unavailable");
                },
            },
        ],
        ["internal"],
    );
    expect(failing.complete).toBe(false);
    expect(failing.unknown).toContain("Consumer internal could not be analysed");
    let revision = 0;
    const changing = await siteUsageInventory(
        repository,
        collections,
        "site",
        [{ id: "internal", snapshot: async () => ({ complete: true, revision: String(++revision), references: [] }) }],
        ["internal"],
    );
    expect(changing.complete).toBe(false);
    expect(changing.unknown).toContain("Site changed while collecting usage; retry the analysis");
});

test("a malformed Page scan cannot silently claim that usage analysis is complete", async () => {
    const scan = async () => ({ pages: [], nextCursor: "page:next" });
    const iterator = collectionPageBatches({ scanPages: scan });
    await expect(iterator.next()).rejects.toThrow("cursor without pages");
});

test("ordinary configuration keys are not misclassified as theme-token overrides", async () => {
    const repository = new InMemoryContentRepository();
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const source = {
        ...collectionDocument(),
        configuration: {
            schema: {
                type: "object",
                properties: {
                    counts: {
                        type: "map",
                        maxKeyLength: 96,
                        maxProperties: 8,
                        values: { type: "integer", minimum: 0 },
                    },
                },
                required: ["counts"],
            },
            defaults: { counts: { "atlas-order": 2 } },
        },
    };
    const artifact = await collections.importRelease(source);
    await collections.install("site", artifact.digest, 0);
    const inventory = await siteUsageInventory(repository, collections, "site", [], []);
    expect(inventory.complete).toBe(true);
    expect(
        inventory.references.some(
            (reference) =>
                reference.type === "resource" && reference.kind === "theme-token" && reference.id === "order",
        ),
    ).toBe(false);
});
