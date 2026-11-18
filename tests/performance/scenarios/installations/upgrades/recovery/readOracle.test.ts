import { expect, test } from "bun:test";
import { assertRecoveredReader } from "./readOracle";

test("recovery reader oracles require the same fixture identity and the exact prepared-to-completed revision transition", () => {
    const expected = {
        id: `sha256:${"a".repeat(64)}`,
        kind: "contracts" as const,
        revision: 7,
        createdAt: "2026-11-18T00:00:00.000Z",
    };
    const prepared = { upgradeId: expected.id, status: "prepared", selectionRevision: 7 };
    const complete = { upgradeId: expected.id, status: "completed", selectionRevision: 8 };
    expect(() => assertRecoveredReader(prepared, "get-contract-upgrade", expected, false)).not.toThrow();
    expect(() => assertRecoveredReader(complete, "get-contract-upgrade", expected, true)).not.toThrow();
    expect(() =>
        assertRecoveredReader(
            {
                maintenance: true,
                activeUpgrade: {
                    id: expected.id,
                    kind: "contracts",
                    status: "prepared",
                    createdAt: expected.createdAt,
                },
            },
            "get-site-upgrade-status",
            expected,
            false,
        ),
    ).not.toThrow();
    expect(() =>
        assertRecoveredReader({ maintenance: false }, "get-site-upgrade-status", expected, true),
    ).not.toThrow();
    for (const invalid of [
        prepared,
        { ...complete, upgradeId: `sha256:${"b".repeat(64)}` },
        { ...complete, selectionRevision: 7 },
        { ...complete, status: "applying" },
        { ...complete, secret: "private" },
    ]) {
        expect(() => assertRecoveredReader(invalid, "get-contract-upgrade", expected, true)).toThrow();
    }
    expect(() =>
        assertRecoveredReader(
            { maintenance: false, activeUpgrade: { id: expected.id } },
            "get-site-upgrade-status",
            expected,
            true,
        ),
    ).toThrow();
    expect(() =>
        assertRecoveredReader(
            { upgradeId: expected.id, status: "completed", collectionRevision: 8 },
            "get-collection-upgrade",
            { ...expected, kind: "collection" },
            true,
        ),
    ).not.toThrow();
});
