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
    });
    expect(JSON.stringify(before)).toBe(original);
});
