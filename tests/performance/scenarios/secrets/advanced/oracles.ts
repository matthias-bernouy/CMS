import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";

export function assertSecretMetadataList(
    output: unknown,
    expected: readonly Readonly<Record<string, unknown>>[],
    limit: number,
) {
    const rows = requireRecord(output).items;
    assertCondition(Array.isArray(rows) && rows.length === Math.min(expected.length, limit));
    const ordered = [...expected]
        .sort((a, b) => (String(a.name) < String(b.name) ? -1 : String(a.name) > String(b.name) ? 1 : 0))
        .slice(0, limit);
    assertCondition(canonicalizeIJson(rows) === canonicalizeIJson(ordered), "secret-list-order-version-or-scope");
    assertCondition(
        rows.every((row) => !("value" in requireRecord(row)) && !("storageKey" in requireRecord(row))),
        "secret-list-private-value-leak",
    );
}
