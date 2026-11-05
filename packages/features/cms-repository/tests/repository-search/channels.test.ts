import { expect, test } from "bun:test";
import { RepositorySearch } from "../../src/repository/search/core/service";
import { row, source } from "./fixture";

test("stable discovery survives a newer beta and channel cursors cannot be mixed", async () => {
    const rows = [
        row("example.official/cards", "Cards", "1.0.0"),
        row("example.official/cards", "Cards", "1.1.0-beta.1"),
    ];
    const search = new RepositorySearch(source(rows));
    expect((await search.search({ query: "cards" })).results.map((result) => result.reference.version)).toEqual([
        "1.0.0",
    ]);
    expect(
        (await search.search({ query: "cards", channel: "beta" })).results.map((result) => result.reference.version),
    ).toEqual(["1.1.0-beta.1"]);
    const page = await search.search({ query: "cards", channel: "all", limit: 1 });
    expect(page.nextCursor).toBeDefined();
    await expect(search.search({ query: "cards", channel: "stable", cursor: page.nextCursor })).rejects.toThrow();
    await expect(search.search({ query: "cards", channel: "latest" })).rejects.toThrow("channel");
});

test.each(["collection", "contract", "provider-manifest"] as const)(
    "%s discovery requires explicit beta opt-in",
    async (kind) => {
        const rows = ["1.0.0", "2.0.0-alpha.1", "2.0.0-rc.1"].map((version) => {
            const candidate = row("example.official/cards", "Cards", version);
            return { ...candidate, reference: { ...candidate.reference, kind } };
        });
        const search = new RepositorySearch(source(rows));
        expect((await search.search({ query: "cards" })).results.map((result) => result.reference.version)).toEqual([
            "1.0.0",
        ]);
        expect(
            (await search.search({ query: "cards", channel: "beta" })).results.map(
                (result) => result.reference.version,
            ),
        ).toEqual(["2.0.0-rc.1"]);
        expect((await search.search({ query: "cards", channel: "all" })).results).toHaveLength(2);
    },
);
