import { describe, expect, test } from "bun:test";
import {
    canonicalJsonBytes,
    decodeIntegrationPackageFile,
    parseStrictJsonDocument,
    sha256Hex,
} from "@bernouy/cms-integration-packages";
import {
    OFFICIAL_INTEGRATION_VERIFICATION_POLICY,
    OFFICIAL_PACKAGE_AUDIT_RUNNER_REQUIREMENT,
    OFFICIAL_SQL_BACKFILL_RUNNER_REQUIREMENT,
    OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH,
    buildOfficialIntegrationPackages,
    buildOfficialIntegrationVerificationBackfill,
    loadOfficialIntegrationVerificationBackfill,
    selectOfficialVerificationBackfillPackages,
} from "@bernouy/cms-official-integrations/publication";

describe("official verification backfill artifacts", () => {
    test("canonically binds exactly fourteen immutable runtime packages", async () => {
        const before = await buildOfficialIntegrationPackages();
        const generated = await buildOfficialIntegrationVerificationBackfill();
        const committed = await loadOfficialIntegrationVerificationBackfill();
        const after = await buildOfficialIntegrationPackages();
        const historicalBefore = selectOfficialVerificationBackfillPackages(before, committed.index);
        const historicalAfter = selectOfficialVerificationBackfillPackages(after, committed.index);

        expect(before).toHaveLength(15);
        expect(generated.verifications).toHaveLength(14);
        expect(committed.verifications).toHaveLength(14);
        expect(committed.index.verificationPolicy).toEqual(OFFICIAL_INTEGRATION_VERIFICATION_POLICY);
        expect(committed.indexCanonicalBytes).toEqual(canonicalJsonBytes(committed.index));
        expect(committed.indexDigest).toBe(await sha256Hex(committed.indexCanonicalBytes));
        expect(committed.index).toEqual(generated.index);
        expect(committed.indexDigest).toBe(generated.indexDigest);
        expect(committed.verifications).toEqual(generated.verifications);

        for (const [index, integrationPackage] of historicalBefore.entries()) {
            const rebuilt = historicalAfter[index];
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
            const hasSql = (integrationPackage.definition.connectors ?? []).some(
                (connector) => connector.provider === "supabase" && (connector.schemas?.length ?? 0) > 0,
            );
            expect(verification?.envelope.manifest.runnerRequirements).toEqual([
                hasSql ? OFFICIAL_SQL_BACKFILL_RUNNER_REQUIREMENT : OFFICIAL_PACKAGE_AUDIT_RUNNER_REQUIREMENT,
            ]);
            expect(rebuilt?.digest).toBe(integrationPackage.digest);
            expect(rebuilt?.canonicalBytes).toEqual(integrationPackage.canonicalBytes);
            expect(Object.keys(integrationPackage.package.envelope.files)).not.toContain(
                OFFICIAL_VERIFICATION_BACKFILL_INDEX_PATH,
            );
        }
        expect(committed.index.entries).not.toContainEqual(
            expect.objectContaining({ kind: "photo-albums", version: "1.1.0" }),
        );
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

    test("keeps the immutable legacy inventory closed when newer packages exist", async () => {
        const packages = await buildOfficialIntegrationPackages();
        const committed = await loadOfficialIntegrationVerificationBackfill();
        const source = packages.find(({ kind }) => kind === "newsletter");
        if (!source) {
            throw new Error("Newsletter package is missing");
        }
        const future = {
            ...source,
            version: "1.1.0",
            digest: "f".repeat(64),
        };

        const selected = selectOfficialVerificationBackfillPackages([...packages, future], committed.index);

        expect(selected).toHaveLength(14);
        expect(selected.some(({ version }) => version === "1.1.0")).toBeFalse();
        expect(() =>
            selectOfficialVerificationBackfillPackages(
                packages.filter(({ kind }) => kind !== "newsletter"),
                committed.index,
            ),
        ).toThrow("exact published package set");
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
