import { assertCondition, requireRecord } from "../../../../../queries/types";
import { referenceKey } from "./expected";
import type { UsageReference } from "./expected";

export function usagePageOracle(
    expected: ReadonlyMap<string, UsageReference>,
    limit: number,
    digest?: string,
    complete = false,
) {
    return (output: unknown) => {
        const row = requireRecord(output);
        assertCondition(
            row.complete === true &&
                row.unknownCount === 0 &&
                Array.isArray(row.unknown) &&
                row.unknown.length === 0 &&
                row.total === expected.size,
            "usage-read-completeness-and-total",
        );
        assertCondition(
            typeof row.digest === "string" &&
                /^sha256:[a-f0-9]{64}$/u.test(row.digest) &&
                (!digest || row.digest === digest),
            "usage-read-stable-digest",
        );
        assertCondition(
            Array.isArray(row.references) && row.references.length > 0 && row.references.length <= limit,
            "usage-read-nonempty-bounded-page",
        );
        const seen = new Set<string>();
        for (const reference of row.references) {
            const key = referenceKey(reference);
            assertCondition(expected.has(key) && !seen.has(key), "usage-read-stale-foreign-or-duplicate-reference");
            seen.add(key);
        }
        assertCondition(
            row.cursor === undefined ||
                (typeof row.cursor === "string" && row.cursor.length > 0 && row.cursor.length <= 96),
            "usage-read-cursor-bound",
        );
        if (complete) {
            assertCondition(
                seen.size === expected.size && row.cursor === undefined,
                "usage-read-complete-invalidation-page",
            );
        }
    };
}
