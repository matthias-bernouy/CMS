import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../queries/types";

export type PageRow = Readonly<{ id: string; path: string; title: string; visible: boolean }>;

/** Command receipts, rather than the list under test, establish the complete expected page. */
export function pageListOracle(rows: readonly PageRow[], offset: number, limit: number) {
    assertCondition(Number.isSafeInteger(offset) && offset >= 0 && offset <= rows.length, "page-list-offset");
    assertCondition(Number.isSafeInteger(limit) && limit >= 1 && limit <= 100, "page-list-limit");
    const items = rows.slice(offset, offset + limit);
    const expected = {
        items,
        ...(offset + limit < rows.length ? { nextCursor: items.at(-1)!.id } : {}),
    };
    return (output: Readonly<Record<string, unknown>>) => {
        assertCondition(canonicalizeIJson(output) === canonicalizeIJson(expected), "page-list-exact-page");
    };
}
