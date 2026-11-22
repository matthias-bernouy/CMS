import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";
export function equal(actual: unknown, expected: unknown) {
    assertCondition(canonicalizeIJson(actual) === canonicalizeIJson(expected));
}
export function listPage(output: unknown, ids: readonly string[], submissions = false) {
    const page = requireRecord(output);
    const rows = page[submissions ? "submissions" : "forms"];
    assertCondition(Array.isArray(rows));
    equal(
        rows.map((item) => requireRecord(item).id),
        (submissions ? [...ids] : [...ids].sort()).slice(0, 25),
    );
    assertCondition(ids.length > 25 ? typeof page.next === "string" : page.next === undefined);
    for (const row of rows) {
        assertCondition(!("answers" in requireRecord(row)) && !("draft" in requireRecord(row)));
    }
}
