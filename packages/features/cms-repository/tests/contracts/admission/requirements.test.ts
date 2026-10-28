import { describe, expect, test } from "bun:test";
import { parseContractRelease, computeReleaseDigest } from "@bernouy/cms-repository/contracts";
import { compareContractReleases } from "@bernouy/cms-repository/contracts/compatibility";
import { capabilityDocument, contractDocument } from "../support/fixtures";

describe("capability authority metadata", () => {
    test("rejects removed cross-contract requirements, including empty declarations", () => {
        for (const requires of [[], [{ contractId: "example.other", capabilityId: "read", versionRange: "^1.0.0" }]]) {
            expect(() =>
                parseContractRelease(contractDocument({ capabilities: [capabilityDocument({ requires })] })),
            ).toThrow('unknown property "requires"');
        }
    });
    test("requires an explicit sensitivity boolean inside behavior", () => {
        const capability = capabilityDocument();
        const { sensitive: _, ...behavior } = capability.behavior as Record<string, unknown>;
        for (const sensitive of [undefined, null, "false", 0]) {
            expect(() =>
                parseContractRelease(
                    contractDocument({
                        capabilities: [
                            {
                                ...capability,
                                behavior: { ...behavior, ...(sensitive === undefined ? {} : { sensitive }) },
                            },
                        ],
                    }),
                ),
            ).toThrow("sensitive");
        }
        expect(() =>
            parseContractRelease(contractDocument({ capabilities: [{ ...capability, sensitive: false }] })),
        ).toThrow('unknown property "sensitive"');
    });
    test("sensitivity is admitted, immutable, hashed and compared for both queries and commands", async () => {
        for (const effect of ["query", "command"] as const) {
            const document = (sensitive: boolean) =>
                contractDocument({
                    capabilities: [
                        capabilityDocument({
                            errors: [],
                            bindings: [
                                {
                                    id: "http",
                                    transport: "http",
                                    method: effect === "query" ? "QUERY" : "POST",
                                    path: "/test",
                                    input: { body: true },
                                    response: {
                                        successStatuses: [200],
                                        contentTypes: ["application/json"],
                                        errorStatuses: {},
                                    },
                                },
                            ],
                            behavior: {
                                effect,
                                execution: "sync",
                                sensitive,
                                ...(effect === "command" ? { idempotency: "natural" } : {}),
                            },
                        }),
                    ],
                });
            const before = parseContractRelease(document(true));
            const after = parseContractRelease({ ...document(false), version: "2.0.0" });
            expect(before.capabilities[0]!.behavior.sensitive).toBe(true);
            expect(Object.isFrozen(before.capabilities[0]!.behavior)).toBe(true);
            expect(await computeReleaseDigest(document(true))).not.toBe(await computeReleaseDigest(document(false)));
            expect(compareContractReleases(before, after).requiredBump).toBe("major");
        }
    });
});
