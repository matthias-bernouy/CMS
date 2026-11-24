import { assertCondition, requireRecord } from "../../../queries/types";
import { catalogueOracle, searchOracle } from "./oracle";
import type { RegistryReadPorts, PublishedResource } from "./types";

/** Full traversals stay outside timing. A changing search mode can invalidate a cursor once. */
export async function verifyDiscoveryPages(
    read: RegistryReadPorts,
    capability: string,
    input: Readonly<Record<string, unknown>>,
    expected: readonly PublishedResource[],
    exact: PublishedResource,
) {
    const search = ["catalogue-search", "artifacts.search"].includes(capability);
    for (let restart = 0; restart < 2; restart++) {
        let cursor: string | undefined;
        let firstCursor: string | undefined;
        let seen = 0;
        let mode: unknown;
        let revision: unknown;
        const ids = new Set<string>();
        let changed = false;
        for (let page = 0; page < 20; page++) {
            const value = await read.call(
                capability,
                "http",
                { ...input, ...(cursor ? { cursor } : {}) },
                search ? searchOracle(expected, exact, page === 0) : catalogueOracle(expected, seen),
            );
            if (search && page > 0 && value.observation.status === 409 && restart === 0) {
                changed = true;
                break;
            }
            assertCondition(value.observation.validated, "registry-discovery-full-pagination");
            const output = requireRecord(value.output);
            const rows = (search ? output.results : output.releases) as readonly Readonly<Record<string, unknown>>[];
            if (search) {
                assertCondition(
                    page === 0 || (mode === output.mode && revision === output.revision),
                    "registry-search-pagination-scope",
                );
                mode = output.mode;
                revision = output.revision;
                for (const row of rows) {
                    const ref = requireRecord(row.reference);
                    const key = `${ref.id}:${ref.version}`;
                    assertCondition(!ids.has(key), "registry-search-pagination-duplicate");
                    ids.add(key);
                }
            }
            seen += rows.length;
            cursor = typeof output.nextCursor === "string" ? output.nextCursor : undefined;
            firstCursor ??= cursor;
            if (!cursor) {
                assertCondition(
                    search
                        ? seen <= expected.length &&
                              seen >= (mode === "hybrid" ? Math.min(50, expected.length) : expected.length)
                        : seen === expected.length,
                    "registry-discovery-pagination-count",
                );
                if (firstCursor) {
                    const changedInput = search
                        ? { ...input, query: `${exact.reference.publisherId}/missing-query` }
                        : { ...input, publisherId: `${exact.reference.publisherId}-other` };
                    const refused = await read.call(capability, "http", { ...changedInput, cursor: firstCursor });
                    assertCondition(
                        !refused.observation.validated && refused.observation.status === 409,
                        "registry-discovery-cursor-filter-bound",
                    );
                }
                return;
            }
        }
        assertCondition(changed, "registry-discovery-pagination-bound");
    }
    assertCondition(false, "registry-search-repeated-mode-transition");
}
