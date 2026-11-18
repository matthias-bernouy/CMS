import { assertCondition, requireRecord } from "../../../queries/types";
import { expectedSearch, searchPageOracle } from "./oracle";
import type { CollectionReadState } from "../collections/context/types";

export const searchInput = (state: CollectionReadState) => ({
    query: "Collection reader",
    kinds: ["collection"],
    publisherId: state.namespace,
    repositoryIds: [state.repositoryId],
    channel: "stable",
    limit: 16,
});

export async function searchPageInput(state: CollectionReadState, index: number) {
    const base = searchInput(state);
    const expected = expectedSearch(state);
    const pageIndex = index % Math.ceil(Math.min(50, expected.size) / base.limit);
    let cursor: string | undefined;
    for (let page = 0; page < pageIndex; page++) {
        const response = await state.tenant.client(
            "ulvia/cms.installations",
            "repository.search",
            "http",
            { ...base, ...(cursor ? { cursor } : {}) },
            searchPageOracle(expected, base.limit),
        );
        assertCondition(
            response.observation.validated && typeof requireRecord(response.output).nextCursor === "string",
            "site-discovery-page-navigation",
        );
        cursor = String(requireRecord(response.output).nextCursor);
    }
    return { ...base, ...(cursor ? { cursor } : {}) };
}

/** The mounted aggregator deliberately ranks at most fifty candidates per source; test that bound, plus exact lookups outside it. */
export async function verifySearchPages(state: CollectionReadState) {
    const expected = expectedSearch(state);
    const base = searchInput(state);
    const seen = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 8; page++) {
        const response = await state.tenant.client(
            "ulvia/cms.installations",
            "repository.search",
            "http",
            { ...base, ...(cursor ? { cursor } : {}) },
            searchPageOracle(expected, base.limit),
        );
        assertCondition(response.observation.validated, "site-discovery-full-traversal");
        const row = requireRecord(response.output);
        for (const value of row.results as readonly unknown[]) {
            const id = String(requireRecord(requireRecord(value).reference).id);
            assertCondition(!seen.has(id), "site-discovery-cross-page-duplicate");
            seen.add(id);
        }
        cursor = typeof row.nextCursor === "string" ? row.nextCursor : undefined;
        if (!cursor) {
            assertCondition(seen.size === Math.min(50, expected.size), "site-discovery-premature-exhaustion");
            return;
        }
        assertCondition(!cursors.has(cursor), "site-discovery-repeated-cursor");
        cursors.add(cursor);
    }
    assertCondition(false, "site-discovery-page-count-bound");
}
