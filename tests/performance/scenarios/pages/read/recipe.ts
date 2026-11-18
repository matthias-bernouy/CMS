import { assertCondition } from "../../queries/types";
import { fixturePage } from "../client";
import { pageListOracle } from "./oracle";
import type { PageClient } from "../client";
import type { PageReadDataset } from "./dataset";
import type { PreparedSample } from "../../../harness/execution/samples";

export async function preparePageList(
    client: PageClient,
    dataset: PageReadDataset,
    binding: string,
    variant: string,
    index: number,
    foreign: PageClient,
    invalid: (input: Readonly<Record<string, unknown>>) => Promise<void>,
): Promise<PreparedSample> {
    const limit = 16;
    const base = { query: dataset.marker, limit };
    if (variant === "invalidation") {
        const before = dataset.rows();
        const primed = await client("pages.list", binding, base, pageListOracle(before, 0, limit));
        assertCondition(primed.observation.validated, "page-list-prime-failed");
        await dataset.invalidate(index);
    }
    const rows = dataset.rows();
    assertCondition(rows.length === (variant === "large" ? 64 : 1), "page-list-dataset-size");
    const offset = (index % Math.ceil(rows.length / limit)) * limit;
    const input = { ...base, ...(offset ? { cursor: rows[offset - 1]!.id } : {}) };
    return {
        async send() {
            return (await client("pages.list", binding, input, pageListOracle(rows, offset, limit))).observation;
        },
        async verify() {
            // Every continuation page and an exhausted cursor are checked, without earning timing credit.
            for (let start = 0; start < rows.length; start += limit) {
                const result = await client(
                    "pages.list",
                    binding,
                    {
                        ...base,
                        ...(start ? { cursor: rows[start - 1]!.id } : {}),
                    },
                    pageListOracle(rows, start, limit),
                );
                assertCondition(result.observation.validated, "page-list-pagination-failed");
            }
            const exhausted = await client(
                "pages.list",
                binding,
                { ...base, cursor: rows.at(-1)!.id },
                pageListOracle(rows, rows.length, limit),
            );
            assertCondition(exhausted.observation.validated, "page-list-exhausted-cursor");
            const before = await dataset.anchorState();
            const denied = await foreign("pages.list", "http", input);
            assertCondition(
                !denied.observation.validated && [401, 403].includes(denied.observation.status),
                "page-list-foreign-session",
            );
            await invalid(input);
            assertCondition((await dataset.anchorState()) === before, "page-list-refusal-mutated-state");
            const unchanged = await fixturePage(client, "pages.list", input);
            pageListOracle(rows, offset, limit)(unchanged);
        },
    };
}
