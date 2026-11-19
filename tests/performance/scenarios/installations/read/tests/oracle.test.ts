import { expect, test } from "bun:test";
import { installationReadOracle, providerReadAfterDisable } from "../oracle";

test("invalidation refuses stale revisions, changed identity, private fields and unchanged origin/status", () => {
    const settings = {
        configured: true,
        url: "http://changed.localhost",
        revision: 8,
        repositoryEnabled: false,
        creationStatus: "none",
        errorMessage: "",
    };
    const provider = {
        id: "owned",
        providerId: "performance/peer",
        status: "disabled",
        revision: 9,
        endpoint: "http://peer.localhost",
    };
    for (const expected of [settings, provider]) {
        const oracle = installationReadOracle(expected);
        expect(() => oracle(structuredClone(expected))).not.toThrow();
        for (const patch of [{ revision: 1 }, { token: "private-value" }, { unrelated: true }]) {
            expect(() => oracle({ ...expected, ...patch })).toThrow();
        }
    }
    expect(() => installationReadOracle(settings)({ ...settings, url: "http://old.localhost" })).toThrow();
    expect(() => installationReadOracle(provider)({ ...provider, status: "enabled" })).toThrow();
    expect(() => installationReadOracle(provider)({ ...provider, providerId: "foreign/provider" })).toThrow();
});

test("disabling a source invalidates selected access requests as well as its revision without exposing credentials", () => {
    const before = {
        revision: 8,
        paired: true,
        providerId: "performance/peer",
        requests: [
            { contractId: "test/content", capabilityId: "read", selected: true },
            { contractId: "test/content", capabilityId: "write", selected: false },
        ],
    };
    const original = JSON.stringify(before);
    const expected = providerReadAfterDisable(before, "get-provider-access");
    expect(expected).toEqual({
        ...before,
        revision: 9,
        requests: before.requests.map((row) => ({ ...row, selected: false })),
    });
    expect(() => installationReadOracle(expected)({ ...before, revision: 9 })).toThrow("requests");
    expect(() => installationReadOracle(expected)({ ...expected, token: "never-public" })).toThrow("unexpected-fields");
    expect(providerReadAfterDisable({ revision: 8, status: "enabled" }, "get-provider-installation")).toEqual({
        revision: 9,
        status: "disabled",
        contracts: [],
    });
    expect(JSON.stringify(before)).toBe(original);
});

test("disabled installation projection clears observations while preserving approval and selection identity", () => {
    const before = {
        id: "owned",
        providerId: "performance/peer",
        accountId: "peer-account",
        endpoint: "http://peer.localhost",
        manifestVersion: "1.0.0",
        revision: 8,
        status: "enabled",
        observedAt: "2026-11-19T00:00:00.000Z",
        contracts: [{ contractId: "test/content", version: "1.0.0", digest: "a".repeat(64), status: "ready" }],
        selections: [{ contractId: "test/content", version: "1.0.0", digest: "a".repeat(64), installationId: "owned" }],
    };
    const original = structuredClone(before);
    const expected = providerReadAfterDisable(before, "get-provider-installation");
    const { observedAt: _observedAt, contracts: _contracts, ...approval } = before;
    expect(expected).toEqual({ ...approval, revision: 9, status: "disabled", contracts: [] });
    expect(expected).not.toHaveProperty("observedAt");
    const assert = installationReadOracle(expected);
    expect(() => assert(structuredClone(expected))).not.toThrow();
    for (const stale of [
        { contracts: before.contracts },
        { observedAt: before.observedAt },
        { revision: 8 },
        { status: "enabled" },
        { providerId: "foreign/provider" },
        { accountId: "foreign-account" },
        { endpoint: "http://foreign.localhost" },
        { manifestVersion: "2.0.0" },
        { selections: [] },
        { token: "never-public" },
    ]) {
        expect(() => assert({ ...expected, ...stale })).toThrow();
    }
    expect(before).toEqual(original);
});
