import { describe, expect, test } from "bun:test";
import { computeReleaseDigest, parseContractRelease } from "@bernouy/cms-repository/contracts";
import { capabilityDocument, contractDocument } from "../support/fixtures";

describe("capability deprecation", () => {
    test("requires at least one piece of guidance before admission or hashing", async () => {
        const emptyDeprecation = contractDocument({ capabilities: [capabilityDocument({ deprecation: {} })] });
        expect(() => parseContractRelease(emptyDeprecation)).toThrow("must include reason, replacedBy, or sunsetAt");
        await expect(computeReleaseDigest(emptyDeprecation)).rejects.toThrow(
            "must include reason, replacedBy, or sunsetAt",
        );
        expect(() =>
            parseContractRelease(
                contractDocument({ capabilities: [capabilityDocument({ deprecation: { reason: "   " } })] }),
            ),
        ).toThrow("must not be blank");
        expect(() =>
            parseContractRelease(
                contractDocument({ capabilities: [capabilityDocument({ deprecation: { deprecated: true } })] }),
            ),
        ).toThrow('unknown property "deprecated"');
        expect(() =>
            parseContractRelease(contractDocument({ capabilities: [capabilityDocument({ lifecycle: {} })] })),
        ).toThrow('unknown property "lifecycle"');
    });

    test("accepts a reason or sunset date without a replacement", () => {
        const reason = parseContractRelease(
            contractDocument({
                capabilities: [capabilityDocument({ deprecation: { reason: "No longer recommended." } })],
            }),
        );
        const sunset = parseContractRelease(
            contractDocument({
                capabilities: [capabilityDocument({ deprecation: { sunsetAt: "2027-01-01T00:00:00Z" } })],
            }),
        );

        expect(reason.capabilities[0]?.deprecation).toEqual({ reason: "No longer recommended." });
        expect(sunset.capabilities[0]?.deprecation).toEqual({ sunsetAt: "2027-01-01T00:00:00Z" });
    });

    test("validates replacement and advisory sunset date", () => {
        const deprecation = { replacedBy: "email.message.send-v2", sunsetAt: "2027-01-01T00:00:00Z" };
        const deprecated = capabilityDocument({ deprecation });
        const replacement = capabilityDocument({ id: "email.message.send-v2" });

        const release = parseContractRelease(contractDocument({ capabilities: [deprecated, replacement] }));
        expect(release.capabilities[0]?.deprecation?.replacedBy).toBe(replacement.id);
        const replacementOnly = parseContractRelease(
            contractDocument({
                capabilities: [
                    capabilityDocument({ deprecation: { replacedBy: "email.message.send-v2" } }),
                    replacement,
                ],
            }),
        );
        expect(replacementOnly.capabilities[0]?.deprecation).toEqual({ replacedBy: "email.message.send-v2" });
        expect(() => parseContractRelease(contractDocument({ capabilities: [deprecated] }))).toThrow(
            "must identify another capability",
        );
        expect(() =>
            parseContractRelease(
                contractDocument({
                    capabilities: [capabilityDocument({ deprecation: { sunsetAt: "2027-02-29T00:00:00Z" } })],
                }),
            ),
        ).toThrow("must be a valid date-time");
    });
});
