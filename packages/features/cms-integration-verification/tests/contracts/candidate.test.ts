import { describe, expect, test } from "bun:test";
import { computeIntegrationPackageDigest } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    parseIntegrationCandidateEnvelope,
    validateIntegrationCandidateEnvelope,
} from "../../src/exports/index";
import { DIGEST_A, packageEnvelope, verificationEnvelope } from "./fixtures";

describe("integration candidate envelope", () => {
    test("keeps the canonical inner package as the public package identity", async () => {
        const packageValue = packageEnvelope();
        const verification = await verificationEnvelope();
        const candidate = {
            schema: "cms.integration.candidate.v1",
            package: packageValue,
            verification,
            submission: { requestedChannel: "latest" },
        };
        const parsed = await validateIntegrationCandidateEnvelope(candidate);

        expect(parsed.packageDigest).toBe(await computeIntegrationPackageDigest(packageValue));
        expect(parsed.verificationDigest).toBe(await computeIntegrationVerificationDigest(verification));
        expect(parsed.envelope.package).toEqual(packageValue);
    });

    test("rejects a verification bundle bound to another exact package", async () => {
        const verification = await verificationEnvelope();
        await expect(
            validateIntegrationCandidateEnvelope({
                schema: "cms.integration.candidate.v1",
                package: packageEnvelope(),
                verification: { ...verification, target: { ...verification.target, packageDigest: DIGEST_A } },
                submission: {},
            }),
        ).rejects.toThrow(/exact candidate package identity/);
    });

    test("requires managed release notes and keeps the wrapper closed", async () => {
        const verification = await verificationEnvelope();
        const packageValue = packageEnvelope();
        const { releaseNotes: _, ...withoutNotes } = packageValue;
        await expect(
            validateIntegrationCandidateEnvelope({
                schema: "cms.integration.candidate.v1",
                package: withoutNotes,
                verification,
                submission: {},
            }),
        ).rejects.toThrow(/releaseNotes is required/);
        await expect(
            validateIntegrationCandidateEnvelope({
                schema: "cms.integration.candidate.v1",
                package: packageValue,
                verification,
                submission: { requestedChannel: "stable" },
            }),
        ).rejects.toThrow(/must be latest/);
    });

    test("rejects duplicate outer JSON fields before candidate validation", async () => {
        const verification = await verificationEnvelope();
        const source = JSON.stringify({
            schema: "cms.integration.candidate.v1",
            package: packageEnvelope(),
            verification,
            submission: {},
        }).replace('"submission":{}', '"submission":{},"submission":{}');

        await expect(parseIntegrationCandidateEnvelope(source)).rejects.toThrow(/duplicate property/);
    });
});
