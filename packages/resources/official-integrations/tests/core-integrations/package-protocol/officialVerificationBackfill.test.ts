import { describe, expect, test } from "bun:test";
import {
    canonicalJsonBytes,
    decodeIntegrationPackageFile,
    parseStrictJsonDocument,
    sha256Hex,
} from "@bernouy/cms-integration-packages";
import {
    OFFICIAL_INTEGRATION_VERIFICATION_POLICY,
    OFFICIAL_INTEGRATION_VERIFICATION_RUNNER_REQUIREMENT,
    OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH,
    buildOfficialIntegrationPackages,
    buildOfficialIntegrationVerificationBackfill,
    loadOfficialIntegrationVerificationBackfill,
} from "@bernouy/cms-official-integrations/publication";

describe("official verification backfill artifacts", () => {
    test("canonically binds exactly fourteen immutable runtime packages", async () => {
        const before = await buildOfficialIntegrationPackages();
        const generated = await buildOfficialIntegrationVerificationBackfill();
        const committed = await loadOfficialIntegrationVerificationBackfill();
        const after = await buildOfficialIntegrationPackages();

        expect(generated.verifications).toHaveLength(14);
        expect(committed.verifications).toHaveLength(14);
        expect(committed.index.verificationPolicy).toEqual(OFFICIAL_INTEGRATION_VERIFICATION_POLICY);
        expect(committed.indexCanonicalBytes).toEqual(canonicalJsonBytes(committed.index));
        expect(committed.indexDigest).toBe(await sha256Hex(committed.indexCanonicalBytes));
        expect(committed.index).toEqual(generated.index);
        expect(committed.indexDigest).toBe(generated.indexDigest);
        expect(committed.verifications).toEqual(generated.verifications);

        for (const [index, integrationPackage] of before.entries()) {
            const rebuilt = after[index];
            const verification = committed.verifications[index];
            expect(rebuilt).toBeDefined();
            expect(verification).toMatchObject({
                kind: integrationPackage.kind,
                version: integrationPackage.version,
                packageDigest: integrationPackage.digest,
            });
            expect(verification?.envelope.target).toEqual({
                kind: integrationPackage.kind,
                version: integrationPackage.version,
                packageDigest: integrationPackage.digest,
            });
            expect(verification?.envelope.manifest.runnerRequirements).toEqual([
                OFFICIAL_INTEGRATION_VERIFICATION_RUNNER_REQUIREMENT,
            ]);
            expect(rebuilt?.digest).toBe(integrationPackage.digest);
            expect(rebuilt?.canonicalBytes).toEqual(integrationPackage.canonicalBytes);
            expect(Object.keys(integrationPackage.package.envelope.files)).not.toContain(
                OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH,
            );
        }
    });

    test("records Photo Albums legacy test ownership without claiming execution", async () => {
        const packages = await buildOfficialIntegrationPackages();
        const committed = await loadOfficialIntegrationVerificationBackfill();
        const photoPackage = packages.find(({ kind }) => kind === "photo-albums");
        const photoVerification = committed.verifications.find(({ kind }) => kind === "photo-albums");
        expect(photoPackage).toBeDefined();
        expect(photoVerification).toBeDefined();
        expect(photoVerification?.envelope.manifest.contracts).toEqual([]);
        expect(photoVerification?.envelope.manifest.conformance).toEqual([]);
        expect(photoVerification?.envelope.manifest.fixtures).toEqual(["fixtures/legacy-test-ownership.v1.json"]);

        const descriptorFile = photoVerification?.envelope.files["fixtures/legacy-test-ownership.v1.json"];
        expect(descriptorFile?.encoding).toBe("utf8");
        const descriptor = parseStrictJsonDocument(descriptorFile?.content ?? "", 64 * 1_024) as LegacyDescriptor;
        expect(descriptor).toMatchObject({
            schema: "cms.integration.verification.legacy-test-ownership.v1",
            disposition: "documented-not-executed",
            publishedPackageBytes: "retained",
        });
        expect(descriptor.suites.map(({ sourcePath }) => sourcePath)).toEqual([
            "tests/blocs.test.ts",
            "tests/definition.test.ts",
        ]);
        for (const suite of descriptor.suites) {
            const source = photoPackage?.package.envelope.files[suite.sourcePath];
            if (!source) {
                throw new Error(`Photo Albums package test disappeared: ${suite.sourcePath}`);
            }
            expect(suite.portability).toBe("workspace-coupled");
            expect(suite.blockers).toEqual(["package-relative-runtime-assets", "workspace-package-imports"]);
            expect(suite.sourceDigest).toBe(await sha256Hex(decodeIntegrationPackageFile(source)));
        }
    });
});

type LegacyDescriptor = {
    schema: string;
    disposition: string;
    publishedPackageBytes: string;
    suites: Array<{
        sourcePath: string;
        sourceDigest: string;
        portability: string;
        blockers: string[];
    }>;
};
