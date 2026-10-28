import { describe, expect, test } from "bun:test";
import { admitProviderManifest, parseProviderManifest } from "@bernouy/cms-repository/providers";
import { contractDocument, implementation, manifestDocument, releaseCatalogue, requirement } from "../support/fixtures";

describe("provider-owned requirements", () => {
    test("accepts independent implementations and resolves global and local requirements", async () => {
        const catalogue = await releaseCatalogue(
            contractDocument("commerce", "checkout"),
            contractDocument("payment", "pay"),
        );
        const admission = (await catalogue.get("commerce", "1.0.0"))!.admission;
        const document = manifestDocument([implementation("commerce", "1.0.0", admission.digest)]);
        await expect(admitProviderManifest(document, catalogue)).resolves.toMatchObject({
            kind: "admitted-provider-manifest",
        });
        document.requires = [requirement("payment", "pay")];
        await expect(admitProviderManifest(document, catalogue)).resolves.toMatchObject({
            manifest: { requires: [expect.objectContaining({ contractId: "payment" })] },
        });
        document.requires = [requirement("missing", "read")];
        await expect(admitProviderManifest(document, catalogue)).rejects.toThrow("no non-yanked");
    });
    test("requires explicit global declarations and rejects duplicate or optional shorthand", () => {
        const document = manifestDocument([implementation("commerce", "1.0.0", `sha256:${"a".repeat(64)}`)]);
        const { requires: _, ...missing } = document;
        expect(() => parseProviderManifest(missing)).toThrow("$.requires");
        expect(() =>
            parseProviderManifest({
                ...document,
                requires: [requirement("payment", "pay"), requirement("payment", "pay")],
            }),
        ).toThrow("duplicate");
        expect(() =>
            parseProviderManifest({
                ...document,
                requires: [{ contractId: "payment", capabilityId: "pay", versionRange: "^1.0.0" }],
            }),
        ).toThrow("optional");
    });
});
