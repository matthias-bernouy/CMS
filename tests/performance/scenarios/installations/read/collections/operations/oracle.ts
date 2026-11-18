import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../../queries/types";
import type { CollectionReadState } from "../context/types";

export type KnownOperation = Readonly<{
    operationId: string;
    capabilityId: string;
    status: "succeeded";
    revision: number;
    createdAt: string;
    updatedAt: string;
}>;

/** The separately authenticated detailed reader witnesses the known writer receipt, not the list under test. */
export async function observeKnownOperation(
    state: CollectionReadState,
    operationId: string,
    capabilityId: string,
    result: Readonly<Record<string, unknown>>,
) {
    const row = await state.tenant.fixture("get-operation", { operationId });
    assertCondition(
        row.operationId === operationId &&
            row.capabilityId === capabilityId &&
            row.status === "succeeded" &&
            canonicalizeIJson(row.result) === canonicalizeIJson(result),
        "operation-read-writer-receipt",
    );
    assertCondition(
        typeof row.revision === "number" &&
            Number.isSafeInteger(row.revision) &&
            row.revision > 0 &&
            typeof row.createdAt === "string" &&
            typeof row.updatedAt === "string",
        "operation-read-record-metadata",
    );
    const created = Date.parse(row.createdAt);
    const updated = Date.parse(row.updatedAt);
    assertCondition(
        Number.isFinite(created) && updated >= created && updated <= Date.now() + 1000,
        "operation-read-record-chronology",
    );
    return {
        operationId,
        capabilityId,
        status: "succeeded" as const,
        revision: row.revision,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

/** Cursor encoding and ordering are opaque. Complete traversal checks the entire independently known set. */
export function operationPageOracle(
    known: ReadonlyMap<string, KnownOperation>,
    limit: number,
    complete = false,
    nonempty = false,
) {
    return (output: unknown) => {
        const row = requireRecord(output);
        assertCondition(
            Object.keys(row).every((key) => ["items", "nextCursor"].includes(key)) &&
                Array.isArray(row.items) &&
                row.items.length <= limit &&
                (!nonempty || row.items.length > 0),
            "operation-read-public-page",
        );
        const seen = new Set<string>();
        for (const item of row.items) {
            const value = requireRecord(item);
            const expected = known.get(String(value.operationId));
            assertCondition(
                expected && !seen.has(expected.operationId) && canonicalizeIJson(value) === canonicalizeIJson(expected),
                "operation-read-stale-duplicate-or-private-fields",
            );
            seen.add(expected.operationId);
        }
        assertCondition(
            row.nextCursor === undefined ||
                (typeof row.nextCursor === "string" && row.nextCursor.length > 0 && row.nextCursor.length <= 256),
            "operation-read-cursor-bound",
        );
        if (complete) {
            assertCondition(
                row.items.length === known.size && row.nextCursor === undefined,
                "operation-read-complete-invalidation-projection",
            );
        }
    };
}
