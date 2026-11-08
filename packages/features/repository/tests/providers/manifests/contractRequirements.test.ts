import { describe, expect, test } from "bun:test";
import { admitProviderManifest, parseProviderManifest } from "@bernouy/ulvia-providers";
import { contractDocument, implementation, manifestDocument, releaseCatalogue, requirement } from "../support/fixtures";

describe("provider-owned requirements", () => {
    test("accepts independent implementations and resolves global and local requirements", async () => {
        const catalogue = await releaseCatalogue(
            contractDocument("ulvia/commerce", "checkout"),
            contractDocument("ulvia/payment", "pay"),
        );
        const admission = (await catalogue.get("ulvia/commerce", "1.0.0"))!.admission;
        const document = manifestDocument([implementation("ulvia/commerce", "1.0.0", admission.digest)]);
        await expect(admitProviderManifest(document, catalogue)).resolves.toMatchObject({
            kind: "admitted-provider-manifest",
        });
        document.requires = [requirement("ulvia/payment", "pay")];
        await expect(admitProviderManifest(document, catalogue)).resolves.toMatchObject({
            manifest: { requires: [expect.objectContaining({ contractId: "ulvia/payment" })] },
        });
        document.requires = [requirement("ulvia/missing", "read")];
        await expect(admitProviderManifest(document, catalogue)).rejects.toThrow("no non-yanked");
    });
    test("requires explicit global declarations and rejects duplicate or optional shorthand", () => {
        const document = manifestDocument([implementation("ulvia/commerce", "1.0.0", `sha256:${"a".repeat(64)}`)]);
        const { requires: _, ...missing } = document;
        expect(() => parseProviderManifest(missing)).toThrow("$.requires");
        expect(() =>
            parseProviderManifest({
                ...document,
                requires: [requirement("ulvia/payment", "pay"), requirement("ulvia/payment", "pay")],
            }),
        ).toThrow("duplicate");
        expect(() =>
            parseProviderManifest({
                ...document,
                requires: [{ contractId: "ulvia/payment", capabilityId: "pay", versionRange: "^1.0.0" }],
            }),
        ).toThrow("optional");
    });
});
