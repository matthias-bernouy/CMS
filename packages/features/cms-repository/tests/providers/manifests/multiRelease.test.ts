import { describe, expect, test } from "bun:test";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { contractDocument, implementation, manifestDocument, releaseCatalogue, requirement } from "../support/fixtures";

describe("multi-release provider implementations", () => {
    test("serves several exact releases with deterministic order and separate digest checks", async () => {
        const catalogue = await releaseCatalogue(
            contractDocument("payment", "pay", "1.0.0"),
            contractDocument("payment", "pay", "2.0.0"),
        );
        const entries = (await catalogue.list()).map(({ admission }) =>
            implementation(admission.release.contractId, admission.release.version, admission.digest),
        );
        const first = await admitProviderManifest(manifestDocument(entries), catalogue);
        const second = await admitProviderManifest(manifestDocument([...entries].reverse()), catalogue);
        expect(first.digest).toBe(second.digest);
        expect(first.manifest.implementations.map((entry) => entry.version)).toEqual(["1.0.0", "2.0.0"]);
        await expect(admitProviderManifest(manifestDocument([entries[0]!, entries[0]!]), catalogue)).rejects.toThrow(
            "duplicates",
        );
        const mismatched = { ...entries[1]!, digest: entries[0]!.digest };
        await expect(admitProviderManifest(manifestDocument([entries[0]!, mismatched]), catalogue)).rejects.toThrow(
            "version and digest",
        );
    });

    test("does not invent a cycle through an incompatible implemented release", async () => {
        const catalogue = await releaseCatalogue(
            contractDocument("first", "run", "1.0.0"),
            contractDocument("first", "run", "2.0.0"),
            contractDocument("second", "run"),
        );
        const first1 = (await catalogue.get("first", "1.0.0"))!.admission;
        const first2 = (await catalogue.get("first", "2.0.0"))!.admission;
        const second = (await catalogue.get("second", "1.0.0"))!.admission;
        const entries = [
            implementation("first", "1.0.0", first1.digest, [requirement("second", "run")]),
            implementation("first", "2.0.0", first2.digest),
            implementation("second", "1.0.0", second.digest, [requirement("first", "run", "^2.0.0")]),
        ];
        await expect(admitProviderManifest(manifestDocument(entries), catalogue)).resolves.toMatchObject({
            kind: "admitted-provider-manifest",
        });
        entries[2] = implementation("second", "1.0.0", second.digest, [
            requirement("first", "run", "^1.0.0 || ^2.0.0"),
        ]);
        await expect(admitProviderManifest(manifestDocument(entries), catalogue)).rejects.toThrow("cycle");
    });

    test("does not connect releases missing the required capability", async () => {
        const catalogue = await releaseCatalogue(
            contractDocument("first", "old", "1.0.0"),
            contractDocument("first", "new", "2.0.0"),
            contractDocument("second", "run"),
        );
        const first1 = (await catalogue.get("first", "1.0.0"))!.admission;
        const first2 = (await catalogue.get("first", "2.0.0"))!.admission;
        const second = (await catalogue.get("second", "1.0.0"))!.admission;
        await expect(
            admitProviderManifest(
                manifestDocument([
                    implementation("first", "1.0.0", first1.digest),
                    implementation("first", "2.0.0", first2.digest, [requirement("second", "run")]),
                    implementation("second", "1.0.0", second.digest, [requirement("first", "old", "^1.0.0 || ^2.0.0")]),
                ]),
                catalogue,
            ),
        ).resolves.toMatchObject({ kind: "admitted-provider-manifest" });
    });

    test("does not redundantly claim a specialization and its parent", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        const parent = await admitContractRelease(contractDocument("emailer", "send"));
        await catalogue.publish(parent);
        const childDocument = contractDocument("emailer.smtp", "send");
        childDocument.extends = {
            contractId: "emailer",
            version: "1.0.0",
            digest: parent.digest,
        };
        (childDocument.capabilities as Record<string, unknown>[])[0]!.id = "smtp.configure";
        const child = await admitContractRelease(childDocument);
        await catalogue.publish(child);

        await expect(
            admitProviderManifest(
                manifestDocument([
                    implementation("emailer", "1.0.0", parent.digest),
                    implementation("emailer.smtp", "1.0.0", child.digest),
                ]),
                catalogue,
            ),
        ).rejects.toThrow("both implement emailer");
        await expect(
            admitProviderManifest(manifestDocument([implementation("emailer.smtp", "1.0.0", child.digest)]), catalogue),
        ).resolves.toMatchObject({ kind: "admitted-provider-manifest" });
    });
});
