import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    IntegrationVerificationContractError,
    computeIntegrationVerificationDigest,
    parseIntegrationVerificationEnvelope,
    validateIntegrationVerificationEnvelope,
} from "../../src/exports/index";
import { verificationEnvelope } from "./fixtures";

describe("integration verification envelope", () => {
    test("strictly validates and canonically identifies an independent file bundle", async () => {
        const envelope = await verificationEnvelope();
        const parsed = validateIntegrationVerificationEnvelope(envelope);
        const shuffled = {
            files: Object.fromEntries(Object.entries(envelope.files).reverse()),
            manifest: envelope.manifest,
            target: envelope.target,
            schema: envelope.schema,
        };

        expect(parsed).toEqual(envelope);
        await expect(computeIntegrationVerificationDigest(shuffled)).resolves.toBe(
            await computeIntegrationVerificationDigest(envelope),
        );
        expect(canonicalJsonBytes(parsed.files)).not.toContain("definition.json");
    });

    test("rejects unknown fields at every closed protocol level", async () => {
        const envelope = await verificationEnvelope();
        expect(() => validateIntegrationVerificationEnvelope({ ...envelope, extra: true })).toThrow(/extra/);
        expect(() =>
            validateIntegrationVerificationEnvelope({
                ...envelope,
                manifest: { ...envelope.manifest, generatedSuites: [] },
            }),
        ).toThrow(/generatedSuites/);
        expect(() =>
            validateIntegrationVerificationEnvelope({
                ...envelope,
                manifest: {
                    ...envelope.manifest,
                    contracts: [{ ...envelope.manifest.contracts[0]!, timeout: 10 }],
                },
            }),
        ).toThrow(/timeout/);
    });

    test("uses strict JSON parsing and rejects duplicate properties", async () => {
        const envelope = await verificationEnvelope();
        const source = JSON.stringify(envelope).replace(
            '"schema":"cms.integration.verification.v1"',
            '"schema":"cms.integration.verification.v1","schema":"cms.integration.verification.v1"',
        );

        expect(() => parseIntegrationVerificationEnvelope(source)).toThrow(IntegrationVerificationContractError);
        expect(() => parseIntegrationVerificationEnvelope(source)).toThrow(/duplicate property/);
    });

    test("requires every declared suite and fixture to resolve safely", async () => {
        const envelope = await verificationEnvelope();
        expect(() =>
            validateIntegrationVerificationEnvelope({
                ...envelope,
                manifest: {
                    ...envelope.manifest,
                    conformance: [{ suiteId: "missing", entrypoint: "tests/missing.ts" }],
                },
            }),
        ).toThrow(/does not reference a bundle file/);
        expect(() =>
            validateIntegrationVerificationEnvelope({
                ...envelope,
                manifest: { ...envelope.manifest, fixtures: ["../secret"] },
            }),
        ).toThrow(/does not reference a bundle file/);
    });

    test("binds contract suites and runner ranges to supported SemVer", async () => {
        const envelope = await verificationEnvelope();
        expect(() =>
            validateIntegrationVerificationEnvelope({
                ...envelope,
                manifest: {
                    ...envelope.manifest,
                    contracts: [{ ...envelope.manifest.contracts[0]!, activeMajorRange: "^2.0.0" }],
                },
            }),
        ).toThrow(/does not include version 1.2.0/);
        expect(() =>
            validateIntegrationVerificationEnvelope({
                ...envelope,
                manifest: {
                    ...envelope.manifest,
                    runnerRequirements: [{ name: "cms-postgres", versionRange: "*" }],
                },
            }),
        ).toThrow(/bounded SemVer range/);
    });

    test("applies the shared decoded-byte limit to bundle files", async () => {
        const envelope = await verificationEnvelope();
        expect(() => validateIntegrationVerificationEnvelope(envelope, { limits: { maxDecodedBytes: 4 } })).toThrow(
            /decoded files exceed 4 bytes/,
        );
    });
});
