import { assertCondition, requireRecord } from "../../../../../queries/types";
import { referenceKey } from "./expected";
import { usagePageOracle } from "./oracle";
import type { UsageReadContext } from "./context";
import type { ScenarioClient } from "../../../../../../harness/clients/session";
import type { UsageReference } from "./expected";

export async function usagePageInput(
    client: ScenarioClient,
    expected: ReadonlyMap<string, UsageReference>,
    index: number,
    limit = 64,
) {
    const offset = index % Math.ceil(expected.size / limit);
    let cursor: string | undefined;
    let digest: string | undefined;
    for (let page = 0; page < offset; page++) {
        const response = await client(
            "ulvia/cms.installations",
            "list-site-usage",
            "http",
            { limit, ...(cursor ? { cursor } : {}) },
            usagePageOracle(expected, limit, digest),
        );
        assertCondition(response.observation.validated, "usage-read-navigation");
        const row = requireRecord(response.output);
        assertCondition(typeof row.cursor === "string", "usage-read-nonempty-next-page");
        cursor = row.cursor;
        digest = String(row.digest);
    }
    return { input: { limit, ...(cursor ? { cursor } : {}) }, digest };
}

export async function verifyUsagePages(client: ScenarioClient, expected: ReturnType<UsageReadContext["expected"]>) {
    const seen = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let digest: string | undefined;
    for (let page = 0; page < 32; page++) {
        const response = await client(
            "ulvia/cms.installations",
            "list-site-usage",
            "http",
            { limit: 64, ...(cursor ? { cursor } : {}) },
            usagePageOracle(expected, 64, digest),
        );
        assertCondition(response.observation.validated, "usage-read-full-traversal");
        const row = requireRecord(response.output);
        digest = String(row.digest);
        for (const reference of row.references as readonly unknown[]) {
            const key = referenceKey(reference);
            assertCondition(!seen.has(key), "usage-read-cross-page-duplicate");
            seen.add(key);
        }
        cursor = typeof row.cursor === "string" ? row.cursor : undefined;
        if (!cursor) {
            assertCondition(seen.size === expected.size, "usage-read-premature-exhaustion");
            return;
        }
        assertCondition(!cursors.has(cursor), "usage-read-repeated-cursor");
        cursors.add(cursor);
    }
    assertCondition(false, "usage-read-full-traversal-bound");
}
