import { expect, test } from "bun:test";
import { parseContractRelease } from "@bernouy/cms-repository/contracts";
import { capabilityDocument, contractDocument } from "../support/fixtures";

function document(versionRange: string, additional: Record<string, unknown> = {}) {
    return contractDocument({
        capabilities: [
            capabilityDocument({
                requires: [
                    {
                        contractId: "payment",
                        capabilityId: "payment.create",
                        versionRange,
                        ...additional,
                    },
                ],
            }),
        ],
    });
}

test("dependency requirements accept nonempty ranges and reject the removed support policy", () => {
    expect(() => parseContractRelease(document("^1.0.0 || ^2.0.0"))).not.toThrow();
    expect(() => parseContractRelease(document("^1.0.0-alpha.1"))).not.toThrow();
    expect(() => parseContractRelease(document(">=2.0.0 <1.0.0"))).toThrow("must be nonempty");
    expect(() => parseContractRelease(document("^1.0.0", { supportRanges: ["^1.0.0"] }))).toThrow("supportRanges");
});
