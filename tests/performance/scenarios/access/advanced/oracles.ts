import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";

export function assertPatListing(output: unknown, expected: readonly Readonly<Record<string, unknown>>[]) {
    const rows = requireRecord(output).tokens;
    assertCondition(Array.isArray(rows), "pat-list-items-missing");
    const sorted = (items: readonly unknown[]) =>
        items.map(requireRecord).toSorted((a, b) => String(a.id).localeCompare(String(b.id)));
    assertCondition(
        canonicalizeIJson(sorted(rows)) === canonicalizeIJson(sorted(expected)),
        "pat-list-stale-or-foreign-records",
    );
}

export function assertAccountPage(
    output: unknown,
    expected: readonly Readonly<Record<string, unknown>>[],
    page: number,
    limit: number,
) {
    const row = requireRecord(output);
    assertCondition(Array.isArray(row.users), "account-page-items-missing");
    assertCondition(row.total === expected.length && row.page === page && row.limit === limit, "account-page-metadata");
    const start = (page - 1) * limit;
    const subset = expected.slice(start, start + limit);
    assertCondition(row.hasMore === start + subset.length < expected.length, "account-page-has-more");
    assertCondition(row.users.length === subset.length, "account-page-size");
    for (const [index, value] of row.users.entries()) {
        const user = requireRecord(value);
        const wanted = subset[index]!;
        assertCondition(user.sub === wanted.sub && user.email === wanted.email, "account-page-order-or-scope");
        assertCondition(
            user.administrator === wanted.administrator && user.administratorRevision === wanted.administratorRevision,
            "account-page-stale-authority",
        );
        assertCondition(
            user.createdAt === wanted.createdAt && typeof user.lastSeenAt === "string",
            "account-page-dates",
        );
    }
}
