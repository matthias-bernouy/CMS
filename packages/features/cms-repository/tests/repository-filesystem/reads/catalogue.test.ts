import { expect, test } from "bun:test";
import { cataloguePage, CatalogueInputError } from "../../../src/repository/filesystem/core/catalogue";
import type { RepositoryCatalogueReader } from "../../../src/repository/filesystem/catalogueIndex";

test("catalogue filters precede pagination and cursors cannot cross resource queries", async () => {
    let reads = 0;
    const entries = [
        { publisherId: "a.example", collectionId: "cards", version: "1.0.0" },
        { publisherId: "b.example", collectionId: "cards", version: "1.0.0" },
        { publisherId: "b.example", collectionId: "cards", version: "1.0.1" },
        { publisherId: "b.example", collectionId: "cards", version: "2.0.0" },
        { publisherId: "b.example", collectionId: "layout", version: "1.0.0" },
    ];
    const index: RepositoryCatalogueReader = {
        list: async () => {
            reads++;
            return entries;
        },
    };
    const filter = { publisherId: "b.example", id: "cards" };
    const first = await cataloguePage("collections", index, "2", null, false, filter);
    expect(first.releases.map(({ version }) => version)).toEqual(["1.0.0", "1.0.1"]);
    expect(first.nextCursor).toBeDefined();
    expect(first.nextCursor!.length).toBeLessThanOrEqual(1024);
    expect(reads).toBe(1);
    const second = await cataloguePage("collections", index, "2", first.nextCursor!, false, filter);
    expect(second.releases).toEqual([entries[3]!]);
    expect(second.nextCursor).toBeUndefined();
    expect(reads).toBe(2);
    const decoded = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8"));
    for (const key of [
        "b.example\u0000cards\u0000invalid",
        "b.example\u0000cards",
        "b.example\u0000cards\u00001.0.0\u0000extra",
        "\u0000cards\u00001.0.0",
    ]) {
        const forged = Buffer.from(JSON.stringify([decoded[0], key, decoded[2]])).toString("base64url");
        await expect(cataloguePage("collections", index, "2", forged, false, filter)).rejects.toBeInstanceOf(
            CatalogueInputError,
        );
    }
    expect(reads).toBe(2);
    for (const changed of [
        { ...filter, publisherId: "a.example" },
        { ...filter, id: "layout" },
        { ...filter, version: "1.0.0" },
        {},
    ]) {
        await expect(cataloguePage("collections", index, "2", first.nextCursor!, false, changed)).rejects.toThrow(
            "cursor",
        );
    }
    await expect(cataloguePage("contracts", index, "2", first.nextCursor!, false, filter)).rejects.toThrow("cursor");
    expect(reads).toBe(2);
    const exact = await cataloguePage("collections", index, "20", null, false, { ...filter, version: "1.0.1" });
    expect(exact.releases).toEqual([entries[2]!]);
    expect(exact.nextCursor).toBeUndefined();
    expect((await cataloguePage("collections", index, "2", null)).releases).toEqual(entries.slice(0, 2));
    expect((await cataloguePage("collections", index, "2", null, false, { id: "missing" })).releases).toEqual([]);
});

test("exact catalogue filtering applies to the contract and provider identity fields", async () => {
    for (const [type, key] of [
        ["contracts", "contractId"],
        ["providers", "providerId"],
    ] as const) {
        const expected = { publisherId: "a.example", [key]: "commerce.catalogue", version: "1.0.0" };
        const index: RepositoryCatalogueReader = {
            list: async () => [expected, { ...expected, [key]: "commerce.other" }],
        };
        expect((await cataloguePage(type, index, "1", null, false, { id: "commerce.catalogue" })).releases).toEqual([
            expected,
        ]);
    }
});
