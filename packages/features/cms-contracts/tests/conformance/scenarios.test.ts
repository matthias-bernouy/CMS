import { describe, expect, test } from "bun:test";
import { admitContractRelease, DEFAULT_RELEASE_LIMITS, parseConformanceSuite } from "@bernouy/cms-contracts";

const releaseFixture = (await Bun.file(
    new URL("../../fixtures/protocol-v1/conformance.contract.json", import.meta.url),
).json()) as Record<string, unknown>;
const suiteFixture = (await Bun.file(
    new URL("../../fixtures/protocol-v1/conformance.suite.json", import.meta.url),
).json()) as Record<string, unknown>;

function release(): Record<string, unknown> {
    return structuredClone(releaseFixture);
}

function suite(): Record<string, unknown> {
    return structuredClone(suiteFixture);
}

function calls(value: Record<string, unknown>): Record<string, unknown>[] {
    return (value.scenarios as { calls: Record<string, unknown>[] }[])[0]!.calls;
}

function call(value: Record<string, unknown>, id: string): Record<string, unknown> {
    return calls(value).find((entry) => entry.id === id)!;
}

function capability(value: Record<string, unknown>, id: string): Record<string, unknown> {
    return (value.capabilities as Record<string, unknown>[]).find((entry) => entry.id === id)!;
}

describe("conformance scenario validation", () => {
    test("admits ordered calls, typed captures, actors, checks, and declared errors", async () => {
        const admission = await admitContractRelease(release());
        const parsed = parseConformanceSuite(suite(), admission);
        expect(Object.isFrozen(parsed.scenarios[0]?.calls)).toBe(true);
        expect(parsed.scenarios[0]?.calls.map((entry) => entry.id)).toEqual([
            "create",
            "find",
            "read",
            "delete",
            "missing",
        ]);
    });

    test("rejects unknown capabilities, errors, and duplicate call IDs", async () => {
        const admission = await admitContractRelease(release());
        const unknown = suite();
        call(unknown, "find").capabilityId = "other.find";
        expect(() => parseConformanceSuite(unknown, admission)).toThrow("unknown conformance capability");
        const error = suite();
        call(error, "missing").expect = { kind: "error", code: "OTHER" };
        expect(() => parseConformanceSuite(error, admission)).toThrow("error code is not declared");
        const duplicate = suite();
        call(duplicate, "read").id = "find";
        expect(() => parseConformanceSuite(duplicate, admission)).toThrow("duplicate conformance call IDs");
    });

    test("rejects forward references, malformed markers, and incompatible captures", async () => {
        const admission = await admitContractRelease(release());
        const future = suite();
        calls(future).reverse();
        expect(() => parseConformanceSuite(future, admission)).toThrow("capture is undefined");
        const malformed = suite();
        call(malformed, "read").input = { id: { $capture: "found-id", extra: true } };
        expect(() => parseConformanceSuite(malformed, admission)).toThrow("capture reference must be");
        const changedRelease = release();
        const output = capability(changedRelease, "item.find").output as {
            properties: Record<string, Record<string, unknown>>;
        };
        output.properties.id!.maxLength = 128;
        const changedAdmission = await admitContractRelease(changedRelease);
        const incompatible = suite();
        incompatible.contractDigest = changedAdmission.digest;
        expect(() => parseConformanceSuite(incompatible, changedAdmission)).toThrow("captured value is incompatible");
    });

    test("requires guaranteed capture paths and schema-valid assertions", async () => {
        const changedRelease = release();
        const output = capability(changedRelease, "item.find").output as { required: string[] };
        output.required = ["name"];
        const changedAdmission = await admitContractRelease(changedRelease);
        const optional = suite();
        optional.contractDigest = changedAdmission.digest;
        expect(() => parseConformanceSuite(optional, changedAdmission)).toThrow("required output property");
        const admission = await admitContractRelease(release());
        const wrongPath = suite();
        const checks = (call(wrongPath, "read").expect as { checks: Record<string, unknown>[] }).checks;
        checks[0]!.path = "/unknown";
        expect(() => parseConformanceSuite(wrongPath, admission)).toThrow("unknown output property");
        const wrongValue = suite();
        const values = (call(wrongValue, "read").expect as { checks: Record<string, unknown>[] }).checks;
        values[1]!.equals = 42;
        expect(() => parseConformanceSuite(wrongValue, admission)).toThrow("must be a string");
    });

    test("supports presence checks without treating them as equality", async () => {
        const admission = await admitContractRelease(release());
        const present = suite();
        (call(present, "find").expect as { checks: Record<string, unknown>[] }).checks[0] = {
            path: "/id",
            present: true,
        };
        expect(() => parseConformanceSuite(present, admission)).not.toThrow();
        const ambiguous = suite();
        (call(ambiguous, "find").expect as { checks: Record<string, unknown>[] }).checks[0] = {
            path: "/id",
            present: true,
            equals: "x",
        };
        expect(() => parseConformanceSuite(ambiguous, admission)).toThrow("either equals or present");
    });

    test("bounds scenarios and calls", async () => {
        const admission = await admitContractRelease(release());
        expect(() =>
            parseConformanceSuite(suite(), admission, {
                ...DEFAULT_RELEASE_LIMITS,
                maxConformanceCallsPerScenario: 2,
            }),
        ).toThrow("invalid number of conformance calls");
        expect(() =>
            parseConformanceSuite(suite(), admission, {
                ...DEFAULT_RELEASE_LIMITS,
                maxConformanceScenarios: 0,
            }),
        ).toThrow("invalid number of conformance scenarios");
    });

    test("keeps business template strings literal and rejects duplicate captures", async () => {
        const admission = await admitContractRelease(release());
        const literal = suite();
        call(literal, "find").input = { name: "{{name}}" };
        expect(() => parseConformanceSuite(literal, admission)).not.toThrow();
        const duplicate = suite();
        call(duplicate, "read").captures = [{ name: "found-id", path: "/id" }];
        expect(() => parseConformanceSuite(duplicate, admission)).toThrow("duplicate capture name");
    });
});
