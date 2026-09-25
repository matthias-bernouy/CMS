import { describe, expect, test } from "bun:test";
import { validateScenarioReplay } from "cms-repository/contracts/core/conformance/calls/controls/replay";
import { call } from "./fixtures";

describe("declarative invocation replay", () => {
    test("accepts explicit replay with canonical input identity", () => {
        const original = call("original", { input: { first: 1, second: 2 } });
        const replay = call("replay", { replayOf: "original", input: { second: 2, first: 1 } });
        expect(() => validateScenarioReplay([original, replay], 64)).not.toThrow();
    });

    test("rejects accidental key reuse without replayOf", () => {
        expect(() => validateScenarioReplay([call("original"), call("repeat")], 64)).toThrow("requires replayOf");
    });

    test("permits omitted fresh keys and scopes authored keys by target and actor", () => {
        expect(() =>
            validateScenarioReplay(
                [
                    call("original"),
                    call("fresh-one", { invocationKey: undefined }),
                    call("fresh-two", { invocationKey: undefined }),
                    call("other-contract", { dependencyContractId: "other" }),
                    call("other-capability", { capabilityId: "other.send" }),
                    call("other-actor", { actor: { kind: "authenticated", label: "customer" } }),
                ],
                64,
            ),
        ).not.toThrow();
    });

    test("requires an earlier successful call and an explicit original key", () => {
        expect(() => validateScenarioReplay([call("replay", { replayOf: "later" }), call("later")], 64)).toThrow(
            "earlier successful",
        );
        expect(() =>
            validateScenarioReplay(
                [
                    call("original", { expect: { kind: "error", code: "INVALID_RECIPIENT" } }),
                    call("replay", { replayOf: "original" }),
                ],
                64,
            ),
        ).toThrow("earlier successful");
        expect(() =>
            validateScenarioReplay(
                [call("original", { invocationKey: undefined }), call("replay", { replayOf: "original" })],
                64,
            ),
        ).toThrow("explicit invocationKey");
    });

    test.each([
        { invocationKey: "different" },
        { invocationKey: undefined },
        { capabilityId: "different.send" },
        { dependencyContractId: "different" },
        { actor: { kind: "public" } as const },
        { expect: { kind: "error", code: "INVALID_RECIPIENT" } as const },
    ])("rejects changed replay identity: %j", (change) => {
        expect(() =>
            validateScenarioReplay([call("original"), call("replay", { replayOf: "original", ...change })], 64),
        ).toThrow("preserve the successful target");
    });

    test("rejects changed literals or capture references even when they share a key", () => {
        for (const input of [{ value: 2 }, { value: { $capture: "other" } }]) {
            expect(() =>
                validateScenarioReplay(
                    [
                        call("original", { input: { value: { $capture: "first" } } }),
                        call("replay", { replayOf: "original", input }),
                    ],
                    64,
                ),
            ).toThrow("preserve the authored input");
        }
    });

    test("applies the configured JSON depth when comparing replay input", () => {
        const input = { first: { second: { third: { value: 1 } } } };
        expect(() =>
            validateScenarioReplay([call("original", { input }), call("replay", { replayOf: "original", input })], 4),
        ).not.toThrow();
        expect(() =>
            validateScenarioReplay([call("original", { input }), call("replay", { replayOf: "original", input })], 3),
        ).toThrow("nesting depth");
    });
});
