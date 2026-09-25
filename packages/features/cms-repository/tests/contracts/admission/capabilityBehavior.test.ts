import { describe, expect, test } from "bun:test";
import { parseContractRelease } from "@bernouy/cms-repository/contracts";
import { capabilityDocument, contractDocument } from "../support/fixtures";

function parseBehavior(behavior: Record<string, unknown>) {
    return parseContractRelease(contractDocument({ capabilities: [capabilityDocument({ behavior })] })).capabilities[0]!
        .behavior;
}

describe("capability behavior", () => {
    test("does not require or permit an idempotency declaration for queries", () => {
        expect(parseBehavior({ effect: "query", execution: "sync" })).toEqual({ effect: "query", execution: "sync" });
        expect(() => parseBehavior({ effect: "query", execution: "sync", idempotency: "natural" })).toThrow(
            "queries must not declare idempotency",
        );
    });

    test("requires one of the three command idempotency policies", () => {
        for (const idempotency of ["natural", "keyed", "none"]) {
            expect(parseBehavior({ effect: "command", execution: "sync", idempotency })).toMatchObject({
                idempotency,
            });
        }
        expect(() => parseBehavior({ effect: "command", execution: "sync" })).toThrow(
            "$.capabilities[0].behavior.idempotency: must be a string",
        );
        expect(() => parseBehavior({ effect: "command", execution: "sync", idempotency: "unsafe" })).toThrow(
            'unsupported value "unsafe"',
        );
    });
});
