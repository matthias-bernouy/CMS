import { describe, expect, test } from "bun:test";
import { computeReleaseDigest, DEFAULT_RELEASE_LIMITS, parseContractRelease } from "@bernouy/cms-repository/contracts";
import { compareContractReleases } from "@bernouy/cms-repository/contracts/compatibility";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

const input = { recipient: "reader@example.com", templateId: "welcome" };
const success = { id: "sent", input, outcome: { kind: "success", output: { messageId: "message-1" } } };
const failure = { id: "bad-recipient", input, outcome: { kind: "error", code: "INVALID_RECIPIENT" } };

function withMocks(mocks: unknown[]): Record<string, unknown> {
    return contractDocument({ capabilities: [capabilityDocument({ mocks })] });
}

describe("capability mocks", () => {
    test("admits schema-valid success and declared error examples", async () => {
        const release = withMocks([success, failure]);
        const parsed = parseContractRelease(release);
        expect(parsed.capabilities[0]?.mocks).toHaveLength(2);
        expect(Object.isFrozen(parsed.capabilities[0]?.mocks)).toBe(true);
        expect(await computeReleaseDigest(release)).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    test("rejects invalid values, error codes and duplicate mock IDs", () => {
        expect(() =>
            parseContractRelease(withMocks([{ ...success, outcome: { kind: "success", output: {} } }])),
        ).toThrow("missing required property");
        expect(() =>
            parseContractRelease(withMocks([{ ...failure, outcome: { kind: "error", code: "UNKNOWN" } }])),
        ).toThrow("not declared");
        expect(() => parseContractRelease(withMocks([success, success]))).toThrow("duplicate mock IDs");
        expect(() => parseContractRelease(withMocks([{ ...success, extra: true }]))).toThrow("unknown property");
    });

    test("validates declared error payloads and bounded mock counts", () => {
        const errorCapability = capabilityDocument({
            errors: [
                {
                    code: "INVALID_RECIPIENT",
                    retryable: false,
                    output: objectSchema({ message: stringSchema() }, ["message"]),
                },
            ],
            mocks: [
                {
                    ...failure,
                    outcome: { kind: "error", code: "INVALID_RECIPIENT", output: { message: "Invalid email" } },
                },
            ],
        });
        expect(() => parseContractRelease(contractDocument({ capabilities: [errorCapability] }))).not.toThrow();
        const invalid = {
            ...errorCapability,
            mocks: [{ ...failure, outcome: { kind: "error", code: "INVALID_RECIPIENT", output: {} } }],
        };
        expect(() => parseContractRelease(contractDocument({ capabilities: [invalid] }))).toThrow(
            "missing required property",
        );
        expect(() =>
            parseContractRelease(withMocks([success, failure]), {
                ...DEFAULT_RELEASE_LIMITS,
                maxMocksPerCapability: 1,
            }),
        ).toThrow("too many capability mocks");
    });

    test("changing examples alone needs only a patch", () => {
        const previous = parseContractRelease(contractDocument({ version: "1.0.0" }));
        const next = parseContractRelease(withMocks([success]));
        const patched = parseContractRelease({ ...next, version: "1.0.1" });
        expect(compareContractReleases(previous, patched)).toMatchObject({
            validEvolution: true,
            requiredBump: "patch",
        });
    });

    test("checks container cardinality before materializing nested binary references", () => {
        const binary = { type: "binary", maxBytes: 10 };
        const cases = [
            { schema: { type: "array", maxItems: 1, items: binary }, value: [{ assetId: "missing" }, null] },
            {
                schema: { type: "map", maxKeyLength: 10, maxProperties: 1, values: binary },
                value: { first: { assetId: "missing" }, second: null },
            },
            { schema: objectSchema({ first: binary }), value: { first: { assetId: "missing" }, second: null } },
        ];
        for (const { schema, value } of cases) {
            const document = contractDocument({
                capabilities: [
                    capabilityDocument({
                        input: objectSchema({ payload: schema }, ["payload"]),
                        mocks: [{ ...success, input: { payload: value } }],
                    }),
                ],
            });
            expect(() => parseContractRelease(document)).toThrow("entry count must be between 0 and 1");
        }
    });
});
