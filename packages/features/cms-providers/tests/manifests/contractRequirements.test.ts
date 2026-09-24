import { describe, expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-contracts";
import { admitProviderManifest } from "@bernouy/cms-providers";
import { contractDocument, implementation, manifestDocument, releaseCatalogue, requirement } from "../support/fixtures";

async function fixture() {
    const commerce = contractDocument("commerce", "checkout");
    const capability = (commerce.capabilities as Record<string, unknown>[])[0]!;
    capability.requires = [{ contractId: "payment", capabilityId: "pay", versionRange: "^1.0.0 || ^2.0.0" }];
    const catalogue = await releaseCatalogue(
        contractDocument("payment", "pay"),
        contractDocument("payment", "pay", "2.0.0"),
        commerce,
    );
    const admission = (await catalogue.get("commerce", "1.0.0"))!.admission;
    const document = (requires: Record<string, unknown>[]) =>
        manifestDocument([implementation("commerce", "1.0.0", admission.digest, requires)]);
    return { catalogue, document };
}

describe("mandatory contract requirements in provider manifests", () => {
    test("rejects omitted, optional, or narrowed alternatives", async () => {
        const { catalogue, document } = await fixture();
        const complete = requirement("payment", "pay", "^1.0.0 || ^2.0.0");
        for (const requires of [[], [{ ...complete, optional: true }], [requirement("payment", "pay")]]) {
            await expect(admitProviderManifest(document(requires), catalogue)).rejects.toThrow(
                "mandatory requirement covering",
            );
        }
    });

    test("accepts equivalent range spellings and additional provider-specific requirements", async () => {
        const { catalogue, document } = await fixture();
        const source = contractDocument("emailer", "send");
        await catalogue.publish(await admitContractRelease(source));
        await expect(
            admitProviderManifest(
                document([requirement("payment", "pay", ">=1.0.0 <3.0.0"), requirement("emailer", "send")]),
                catalogue,
            ),
        ).resolves.toMatchObject({ kind: "admitted-provider-manifest" });
    });

    test("checks the requirements of every implemented capability", async () => {
        const commerce = contractDocument("commerce", "checkout");
        const capabilities = commerce.capabilities as Record<string, unknown>[];
        const original = capabilities[0]!;
        capabilities.push({
            ...original,
            id: "refund",
            binding: { ...(original.binding as object), path: "/v1/refund" },
            requires: [{ contractId: "payment", capabilityId: "pay", versionRange: "^1.0.0" }],
        });
        const catalogue = await releaseCatalogue(contractDocument("payment", "pay"), commerce);
        const admitted = (await catalogue.get("commerce", "1.0.0"))!.admission;
        const document = manifestDocument([implementation("commerce", "1.0.0", admitted.digest)]);
        await expect(admitProviderManifest(document, catalogue)).rejects.toThrow("for refund");
    });
});
