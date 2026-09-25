import { describe, expect, test } from "bun:test";
import { computeReleaseDigest, parseContractRelease } from "@bernouy/cms-repository/contracts";
import { capabilityDocument, contractDocument } from "../support/fixtures";

function document(versionRange: string, supportRanges?: unknown) {
    return contractDocument({
        capabilities: [
            capabilityDocument({
                requires: [
                    {
                        contractId: "payment",
                        capabilityId: "payment.create",
                        versionRange,
                        ...(supportRanges === undefined ? {} : { supportRanges }),
                    },
                ],
            }),
        ],
    });
}

describe("explicit dependency support ranges", () => {
    test("preserves omission and normalizes explicit support ranges before hashing", async () => {
        const implicit = parseContractRelease(document("^1.0.0 || ^2.0.0"));
        expect(implicit.capabilities[0]!.requires![0]!.supportRanges).toBeUndefined();
        const parsed = parseContractRelease(document(">=1.0.0 <3.0.0", ["^2.0.0", "^1.0.0"]));
        expect(parsed.capabilities[0]!.requires![0]!.supportRanges).toEqual(["^1.0.0", "^2.0.0"]);
        expect(Object.isFrozen(parsed.capabilities[0]!.requires![0]!.supportRanges)).toBe(true);
        expect(await computeReleaseDigest(document("^1.0.0 || ^2.0.0", ["^1.0.0", "^2.0.0"]))).toBe(
            await computeReleaseDigest(document("^1.0.0 || ^2.0.0", ["^2.0.0", "^1.0.0"])),
        );
    });

    test("requires a bounded nonempty list of nonempty subsets whose union covers acceptance", () => {
        expect(() => parseContractRelease(document("^1.0.0", []))).toThrow("between 1 and 4");
        expect(() => parseContractRelease(document("^1.0.0", ["^1.0.0", "^1.0.0"]))).toThrow("duplicate support");
        expect(() => parseContractRelease(document("^1.0.0", ["^1.0.0", "^2.0.0"]))).toThrow("nonempty subset");
        expect(() => parseContractRelease(document("^1.0.0", [">=1.5.0 <1.1.0"]))).toThrow("nonempty subset");
        expect(() => parseContractRelease(document("^1.0.0", ["~1.0.0"]))).toThrow("cover all accepted");
        expect(() => parseContractRelease(document("^1.0.0", ["^1"]))).toThrow("SemVer range");
        expect(() => parseContractRelease(document(">=2.0.0 <1.0.0"))).toThrow("must be nonempty");
        expect(() => parseContractRelease(document("^1.0.0", ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"]))).toThrow(
            "between 1 and 4",
        );
    });

    test("checks opted-in prereleases as well as stable members", () => {
        expect(() => parseContractRelease(document("^1.0.0-alpha.1", [">=1.0.0 <2.0.0"]))).toThrow(
            "cover all accepted",
        );
        expect(() =>
            parseContractRelease(document("^1.0.0-alpha.1", [">=1.0.0 <2.0.0", ">=1.0.0-alpha.1 <1.0.0"])),
        ).not.toThrow();
        expect(() => parseContractRelease(document("^1.0.0", ["^1.0.0-alpha.1"]))).toThrow("nonempty subset");
    });

    test("unions compiled support sets without applying one range's branch or byte limit", () => {
        const ranges = [
            ">=1.0.0 <1.1.0 || >=1.4.0 <1.5.0",
            ">=1.1.0 <1.2.0 || >=1.5.0 <1.6.0",
            ">=1.2.0 <1.3.0 || >=1.6.0 <1.7.0",
            ">=1.3.0 <1.4.0 || >=1.7.0 <2.0.0",
        ];
        expect(() => parseContractRelease(document("^1.0.0", ranges))).not.toThrow();
        expect(() => parseContractRelease(document("^1.0.0", ["^1.0.0", ">=1.5.0 <2.0.0"]))).not.toThrow();
    });
});
