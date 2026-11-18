import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";

export type NamespaceEvidence = Readonly<{
    namespace: string;
    revision: number;
    state: "active" | "suspended";
    updatedAt: string;
}>;
export const orderedNamespaces = (rows: readonly NamespaceEvidence[]) =>
    rows.toSorted((a, b) => (a.namespace < b.namespace ? -1 : a.namespace > b.namespace ? 1 : 0));

export function namespaceEvidence(value: unknown): NamespaceEvidence {
    const row = requireRecord(value);
    assertCondition(
        Object.keys(row).toSorted().join(",") === "namespace,revision,state,updatedAt" &&
            typeof row.namespace === "string" &&
            /^[a-z0-9-]{1,96}$/u.test(row.namespace) &&
            Number.isSafeInteger(row.revision) &&
            Number(row.revision) >= 1 &&
            ["active", "suspended"].includes(String(row.state)) &&
            typeof row.updatedAt === "string" &&
            Number.isFinite(Date.parse(row.updatedAt)),
        "namespace-read-fixture-fields",
    );
    return row as NamespaceEvidence;
}

export function assertNamespaceList(output: unknown, expected: readonly NamespaceEvidence[]) {
    const row = requireRecord(output);
    assertCondition(
        Object.keys(row).join(",") === "namespaces" &&
            Array.isArray(row.namespaces) &&
            canonicalizeIJson(row.namespaces) === canonicalizeIJson(orderedNamespaces(expected)),
        "namespace-read-owner-list",
    );
}

/** Account identity and PATs are absent from the complete, exact projected row shape. */
export function assertAuthoringPage(
    output: unknown,
    expected: readonly NamespaceEvidence[],
    repositoryId: string,
    startedAt: number,
    cursor?: string,
    limit = 8,
) {
    const row = requireRecord(output);
    const remaining = orderedNamespaces(expected).filter((value) => !cursor || value.namespace > cursor);
    const wanted = remaining.slice(0, limit);
    assertCondition(
        Object.keys(row).toSorted().join(",") === "items,nextCursor" &&
            Array.isArray(row.items) &&
            row.items.length === wanted.length,
        "namespace-read-page-fields",
    );
    for (const [index, value] of row.items.entries()) {
        const item = requireRecord(value);
        const actual = wanted[index]!;
        assertCondition(
            Object.keys(item).toSorted().join(",") === "access,checkedAt,namespace,repositoryId,revision" &&
                item.namespace === actual.namespace &&
                item.repositoryId === repositoryId &&
                item.revision === actual.revision &&
                item.access === (actual.state === "active" ? "owned" : "suspended") &&
                typeof item.checkedAt === "string" &&
                Date.parse(item.checkedAt) >= startedAt &&
                Date.parse(item.checkedAt) <= Date.now(),
            "namespace-read-page-row",
        );
    }
    const next = remaining.length > limit ? wanted.at(-1)!.namespace : null;
    assertCondition(row.nextCursor === next, "namespace-read-page-cursor");
    return row;
}

export async function verifyNamespacePages(
    read: (input: Readonly<Record<string, unknown>>) => Promise<unknown>,
    expected: readonly NamespaceEvidence[],
    repositoryId: string,
    startedAt: number,
) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 6; page++) {
        const row = assertAuthoringPage(
            await read({ limit: 8, ...(cursor ? { cursor } : {}) }),
            expected,
            repositoryId,
            startedAt,
            cursor,
        );
        for (const value of row.items as unknown[]) {
            const name = String(requireRecord(value).namespace);
            assertCondition(!seen.has(name), "namespace-read-duplicate");
            seen.add(name);
        }
        if (row.nextCursor === null) {
            assertCondition(seen.size === expected.length, "namespace-read-incomplete-pagination");
            const last = orderedNamespaces(expected).at(-1)?.namespace;
            if (last) {
                assertAuthoringPage(await read({ limit: 8, cursor: last }), expected, repositoryId, startedAt, last);
            }
            return;
        }
        assertCondition(typeof row.nextCursor === "string");
        cursor = row.nextCursor;
    }
    throw new Error("Namespace fixture exceeded its bounded page count");
}
