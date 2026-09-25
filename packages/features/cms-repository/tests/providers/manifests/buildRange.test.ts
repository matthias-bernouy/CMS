import { describe, expect, test } from "bun:test";
import {
    admitProviderManifest,
    admitProviderManifestJson,
    computeProviderManifestDigest,
    parseProviderManifest,
    parseProviderManifestJson,
    parseVersionRange,
} from "@bernouy/cms-repository/providers";
import { validateProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import { contractDocument, implementation, manifestDocument, releaseCatalogue } from "../support/fixtures";

async function manifestWithBuildRange(buildVersionRange: string) {
    const catalogue = await releaseCatalogue(contractDocument("payment", "create-link"));
    const release = (await catalogue.list())[0]!.admission;
    const document = manifestDocument([implementation("payment", "1.0.0", release.digest)], { buildVersionRange });
    return { catalogue, document };
}

describe("provider build range admission", () => {
    test.each([
        ">=2.0.0 <1.0.0",
        ">1.0.0 <1.0.1",
        "<0.0.0",
        "<0.0.0-0",
        ">=1.0.0-alpha <1.0.0-alpha",
        ">1.0.0-alpha <1.0.0-alpha.0",
        "<0.0.0 || >=2.0.0 <1.0.0",
    ])("rejects the empty build range %s before producing a digest", async (range) => {
        const { catalogue, document } = await manifestWithBuildRange(range);
        const json = JSON.stringify(document);
        const error = {
            name: "ProviderManifestValidationError",
            code: "invalid_manifest",
            path: "$.buildVersionRange",
        };

        // Empty sets remain valid inputs for the generic range algebra.
        expect(() => parseVersionRange(range, "$.range")).not.toThrow();
        expect(() => parseProviderManifest(document)).toThrow("must accept at least one build version");
        expect(() => parseProviderManifestJson(json)).toThrow("must accept at least one build version");
        await expect(admitProviderManifest(document, catalogue)).rejects.toMatchObject(error);
        await expect(admitProviderManifestJson(json, catalogue)).rejects.toMatchObject(error);
        await expect(computeProviderManifestDigest(document, catalogue)).rejects.toMatchObject(error);
    });

    test.each([
        ["^1.0.0", "1.4.2"],
        ["1.2.3", "1.2.3"],
        [">=0.0.0-0 <0.0.0", "0.0.0-0"],
        [">=1.0.0-alpha <1.0.0", "1.0.0-alpha.1"],
        [">1.0.0-alpha <1.0.0-alpha.1", "1.0.0-alpha.0"],
        ["<0.0.0 || ^2.0.0", "2.1.0"],
        [">=9007199254740993.0.0", "9007199254740993.0.0"],
    ])("admits nonempty range %s and its matching build %s", async (range, buildVersion) => {
        const { catalogue, document } = await manifestWithBuildRange(range);
        const admission = await admitProviderManifest(document, catalogue);
        const report = validateProviderRuntimeReport(
            {
                protocol: "ulvia-provider/v1",
                providerId: admission.manifest.providerId,
                account: { id: "shop", label: "Shop" },
                buildVersion,
                manifest: { version: admission.manifest.version, digest: admission.digest },
                implementations: [],
            },
            admission,
            { endpoint: "https://provider.example.com" },
        );
        expect(report.buildVersion).toBe(buildVersion);
        expect((await admitProviderManifestJson(JSON.stringify(document), catalogue)).digest).toBe(admission.digest);
    });
});
