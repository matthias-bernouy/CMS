import { assertCondition, requireRecord } from "../../../queries/types";
import { oauthSuccess } from "../protocol";

export type GrantEvidence = {
    id: string;
    subjectId: string;
    clientName: string;
    token: string;
    createdAfter: number;
    createdBefore: number;
    revoked: boolean;
};

export const grantId = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);
export const orderedGrants = (grants: readonly GrantEvidence[]) =>
    grants.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Match every field and exact binary ID ordering; OAuth secrets must never appear in listing DTOs. */
export function assertGrantPage(output: unknown, expected: readonly GrantEvidence[], cursor?: string, limit = 25) {
    const page = oauthSuccess(output);
    const remaining = orderedGrants(expected).filter((grant) => !cursor || grant.id > cursor);
    const wanted = remaining.slice(0, limit);
    assertCondition(Array.isArray(page.items) && page.items.length === wanted.length, "oauth-read-page-count");
    assertCondition(Object.keys(page).toSorted().join(",") === "items,nextCursor", "oauth-read-page-fields");
    for (const [index, value] of page.items.entries()) {
        const row = requireRecord(value);
        const grant = wanted[index]!;
        const createdAt = Date.parse(String(row.createdAt));
        const expiresAt = Date.parse(String(row.expiresAt));
        assertCondition(
            Object.keys(row).toSorted().join(",") === "clientName,createdAt,expiresAt,id,mode,revoked" &&
                row.id === grant.id &&
                row.clientName === grant.clientName &&
                row.mode === "full_access" &&
                row.revoked === grant.revoked &&
                Number.isFinite(createdAt) &&
                createdAt >= grant.createdAfter &&
                createdAt <= grant.createdBefore &&
                expiresAt >= createdAt + 30 * 86400_000 &&
                expiresAt <= grant.createdBefore + 30 * 86400_000,
            "oauth-read-row-mismatch",
        );
    }
    const next = remaining.length > limit ? wanted.at(-1)!.id : null;
    assertCondition(page.nextCursor === next, "oauth-read-cursor-mismatch");
    return page;
}

export async function verifyGrantPages(
    read: (input: Readonly<Record<string, unknown>>) => Promise<unknown>,
    expected: readonly GrantEvidence[],
) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let index = 0; index < 8; index++) {
        const page = assertGrantPage(await read({ limit: 25, ...(cursor ? { cursor } : {}) }), expected, cursor);
        for (const value of page.items as unknown[]) {
            const id = requireRecord(value).id;
            assertCondition(grantId(id) && !seen.has(id), "oauth-read-duplicate");
            seen.add(id);
        }
        if (page.nextCursor === null) {
            assertCondition(seen.size === expected.length, "oauth-read-pagination-incomplete");
            const last = orderedGrants(expected).at(-1)?.id;
            if (last) {
                assertGrantPage(await read({ limit: 25, cursor: last }), expected, last);
            }
            return;
        }
        assertCondition(grantId(page.nextCursor), "oauth-read-invalid-cursor");
        cursor = page.nextCursor;
    }
    throw new Error("OAuth read fixture exceeded its pagination bound");
}
