import { describe, expect, test } from "bun:test";
import { admitConformanceSuite, admitContractRelease, parseConformanceSuite } from "@bernouy/cms-contracts";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

async function example() {
    const metadata = { type: "map", maxKeyLength: 30, maxProperties: 5, values: stringSchema(30) };
    const shape = objectSchema({ metadata }, ["metadata"]);
    const admission = await admitContractRelease(
        contractDocument({ capabilities: [capabilityDocument({ input: shape, output: shape })] }),
    );
    const input = { metadata: { $literal: { $capture: "ordinary-data", $literal: "also-data" } } };
    const suite = {
        kind: "contract-conformance-suite",
        protocol: "ulvia-conformance/v1",
        contractId: admission.release.contractId,
        contractVersion: admission.release.version,
        contractDigest: admission.digest,
        publisherId: admission.release.publisherId,
        version: "1.0.0",
        isolation: "disposable-tenant",
        scenarios: [
            {
                id: "example",
                calls: [
                    {
                        id: "call",
                        capabilityId: "email.message.send",
                        actor: { kind: "admin" },
                        input,
                        expect: { kind: "success", checks: [{ path: "/metadata", equals: input.metadata }] },
                    },
                ],
            },
        ],
    };
    return { admission, suite, input };
}

describe("literal conformance templates", () => {
    test("escapes capture and literal markers recursively without losing business data", async () => {
        const { admission, suite } = await example();
        const parsed = parseConformanceSuite(suite, admission);
        expect(parsed.scenarios[0]!.calls[0]!.input).toEqual(suite.scenarios[0]!.calls[0]!.input);
        const document = structuredClone(suite);
        document.scenarios[0]!.calls[0]!.input.metadata.$literal.$capture = "not-a-real-capture";
        expect(() => parseConformanceSuite(document, admission)).not.toThrow();
    });

    test("validates escaped values and rejects malformed escapes", async () => {
        const { admission, suite } = await example();
        for (const metadata of [
            { $literal: { value: 1 } },
            { $literal: {}, extra: "field" },
            { $capture: "missing" },
        ]) {
            const document = structuredClone(suite);
            Object.assign(document.scenarios[0]!.calls[0]!, { input: { metadata } });
            expect(() => parseConformanceSuite(document, admission)).toThrow();
        }
    });

    test("owns immutable suite literals even when caller containers are shallow-frozen", async () => {
        const { admission, suite, input } = await example();
        Object.freeze(input);
        const parsed = await admitConformanceSuite(suite, admission);
        input.metadata.$literal.$capture = "changed-by-author";
        expect(parsed.suite.scenarios[0]!.calls[0]!.input).not.toEqual(input);
        expect(Object.isFrozen(input.metadata)).toBe(false);
        const retained = parsed.suite.scenarios[0]!.calls[0]!.input.metadata as { $literal: object };
        expect(Object.isFrozen(retained.$literal)).toBe(true);
    });

    test("reuses a dynamic map value only after an exact successful presence assertion", async () => {
        const { admission, suite } = await example();
        const original = suite.scenarios[0]!.calls[0]!;
        const document = {
            ...suite,
            scenarios: [
                {
                    id: "map-capture",
                    calls: [
                        {
                            ...original,
                            expect: { kind: "success", checks: [{ path: "/metadata/key", present: true }] },
                            captures: [{ name: "map-value", path: "/metadata/key" }],
                        },
                        { ...original, id: "reuse", input: { metadata: { other: { $capture: "map-value" } } } },
                    ],
                },
            ],
        };
        expect(() => parseConformanceSuite(document, admission)).not.toThrow();
        Object.assign(document.scenarios[0]!.calls[0]!, { expect: { kind: "success" } });
        expect(() => parseConformanceSuite(document, admission)).toThrow("presence assertion");
    });

    test("rejects overlapping parent/child assertions instead of admitting contradictions", async () => {
        const { admission, suite } = await example();
        const call = suite.scenarios[0]!.calls[0]!;
        Object.assign(call.expect, {
            checks: [
                { path: "", equals: { metadata: { key: "a" } } },
                { path: "/metadata/key", equals: "b" },
            ],
        });
        expect(() => parseConformanceSuite(suite, admission)).toThrow("overlapping assertion paths");
    });
});
