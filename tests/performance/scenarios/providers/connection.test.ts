import { expect, test } from "bun:test";
import { assertProviderStateUnchanged } from "./oracles";

function fixture() {
    return {
        selectionRevision: 4,
        selections: [{ contractId: "test/content", installationId: "owned", digest: "exact" }],
        routes: [{ contractId: "test/content", selectedInstallationId: "owned", options: [] }],
        installations: [
            {
                id: "owned",
                providerId: "test/provider",
                accountId: "account",
                endpoint: "http://owned.localhost",
                status: "enabled",
                manifestVersion: "1.0.0",
                revision: 2,
                observedAt: "2020-01-01T00:00:00.000Z",
                selectionCount: 1,
            },
        ],
    };
}

test("read/preview/replay/refusal state checks permit only forward observation renewal while keeping approval and routing exact", () => {
    const before = fixture();
    const after = structuredClone(before);
    after.installations[0]!.revision++;
    after.installations[0]!.observedAt = "2020-01-01T00:00:31.000Z";
    expect(() => assertProviderStateUnchanged(before, structuredClone(before))).not.toThrow();
    expect(() => assertProviderStateUnchanged(before, after)).not.toThrow();
    for (const patch of [
        { id: "foreign" },
        { providerId: "foreign/provider" },
        { accountId: "foreign" },
        { endpoint: "http://foreign.localhost" },
        { status: "disabled" },
        { manifestVersion: "1.1.0" },
        { selectionCount: 2 },
        { revision: 1 },
        { revision: 2.5 },
        { providerTokenRef: "private" },
        { observedAt: "invalid" },
        { observedAt: "2019-01-01T00:00:00.000Z" },
        { observedAt: new Date(Date.now() + 60_000).toISOString() },
    ]) {
        expect(() =>
            assertProviderStateUnchanged(before, {
                ...after,
                installations: [{ ...after.installations[0], ...patch }],
            }),
        ).toThrow();
    }
    for (const patch of [
        { installations: [] },
        { installations: [after.installations[0], after.installations[0]] },
        { selectionRevision: 5 },
        { selections: [] },
        { routes: [] },
        { routes: [{ ...after.routes[0], selectedInstallationId: "foreign" }] },
    ]) {
        expect(() => assertProviderStateUnchanged(before, { ...after, ...patch })).toThrow();
    }
});

test("optional unobserved approvals cannot lose an existing observation", () => {
    const before = fixture();
    const unobserved = { ...before, installations: before.installations.map(({ observedAt: _time, ...row }) => row) };
    expect(() => assertProviderStateUnchanged(unobserved, structuredClone(unobserved))).not.toThrow();
    expect(() => assertProviderStateUnchanged(unobserved, before)).not.toThrow();
    expect(() => assertProviderStateUnchanged(before, unobserved)).toThrow("provider-query-observation-invalid");
});
