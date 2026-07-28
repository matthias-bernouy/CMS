import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1,
    identifyPlatformVerificationSuiteDefinition,
    parsePlatformVerificationEvidence,
    validateVerificationJobResultForAdmission,
    type PlatformVerificationEvidenceV1,
} from "../../../src/exports/index";
import { DIGEST_A } from "../fixtures";
import { ATTEMPT, admissionSnapshot, jobResult, policySnapshot } from "./controlFixtures";

describe("generated platform evidence", () => {
    test("binds every policy-owned check to the exact suite definition", async () => {
        const fixture = await generatedEvidenceFixture();

        await expect(
            validateVerificationJobResultForAdmission(fixture.result, fixture.admission, fixture.policy, ATTEMPT),
        ).resolves.toBeDefined();
        await expect(
            validateVerificationJobResultForAdmission(
                {
                    ...fixture.result,
                    results: fixture.result.results.map((entry) => {
                        if (entry.suiteId !== fixture.evidence.suiteId) {
                            return entry;
                        }
                        const { platformEvidence: _platformEvidence, ...withoutEvidence } = entry;
                        return withoutEvidence;
                    }),
                },
                fixture.admission,
                fixture.policy,
                ATTEMPT,
            ),
        ).rejects.toThrow(/does not prove exact platform suite/);
    });

    test("rejects fabricated applicability and internally inconsistent outcomes", async () => {
        const fixture = await generatedEvidenceFixture();
        expect(() =>
            parsePlatformVerificationEvidence({
                ...fixture.evidence,
                outcome: "not-applicable",
            }),
        ).toThrow(/must be passed/);

        const notApplicable: PlatformVerificationEvidenceV1 = {
            ...fixture.evidence,
            outcome: "not-applicable",
            checks: fixture.evidence.checks.map((check) => ({
                ...check,
                outcome: "not-applicable",
                subjectCount: 0,
            })),
        };
        const evidenceDigest = await sha256Hex(canonicalJsonBytes(notApplicable));
        await expect(
            validateVerificationJobResultForAdmission(
                {
                    ...fixture.result,
                    results: fixture.result.results.map((entry) =>
                        entry.suiteId === fixture.evidence.suiteId
                            ? {
                                  ...entry,
                                  outcome: "not-applicable" as const,
                                  evidenceDigests: [evidenceDigest],
                                  platformEvidence: notApplicable,
                              }
                            : entry,
                    ),
                },
                fixture.admission,
                fixture.policy,
                ATTEMPT,
            ),
        ).rejects.toThrow(/must be not-applicable exactly/);
    });

    test("reserves generated evidence for platform-owned suites", async () => {
        const fixture = await generatedEvidenceFixture();
        const author = fixture.result.results.find((entry) => entry.suiteId === "implementation")!;
        const forgedEvidence = { ...fixture.evidence, suiteId: author.suiteId };
        const forgedDigest = await sha256Hex(canonicalJsonBytes(forgedEvidence));
        await expect(
            validateVerificationJobResultForAdmission(
                {
                    ...fixture.result,
                    results: fixture.result.results.map((entry) =>
                        entry.suiteId === author.suiteId
                            ? {
                                  ...entry,
                                  platformEvidence: forgedEvidence,
                                  evidenceDigests: [forgedDigest],
                              }
                            : entry,
                    ),
                },
                fixture.admission,
                fixture.policy,
                ATTEMPT,
            ),
        ).rejects.toThrow(/reserved for policy-generated suites/);
    });

    test("rejects a structured proof whose recorded evidence digest identifies different bytes", async () => {
        const fixture = await generatedEvidenceFixture();
        await expect(
            validateVerificationJobResultForAdmission(
                {
                    ...fixture.result,
                    results: fixture.result.results.map((entry) =>
                        entry.suiteId === fixture.evidence.suiteId ? { ...entry, evidenceDigests: [DIGEST_A] } : entry,
                    ),
                },
                fixture.admission,
                fixture.policy,
                ATTEMPT,
            ),
        ).rejects.toThrow(/must contain the canonical platform evidence digest/);
    });
});

async function generatedEvidenceFixture() {
    const definition = POSTGRES_PLATFORM_VERIFICATION_SUITES_V1[0]!;
    const suiteDigest = (await identifyPlatformVerificationSuiteDefinition(definition)).digest;
    const basePolicy = await policySnapshot();
    const policy = {
        ...basePolicy,
        platformRequiredSuites: [
            {
                suiteId: definition.suiteId,
                suiteDigest,
                runner: basePolicy.approvedRunners[1]!,
                applicability: "always",
            },
        ],
    } as const;
    const baseAdmission = await admissionSnapshot(policy);
    const admission = {
        ...baseAdmission,
        suites: [
            ...baseAdmission.suites.filter((suite) => suite.source !== "platform"),
            { suiteId: definition.suiteId, source: "platform" as const, contentDigest: suiteDigest, applicable: true },
        ],
    };
    const evidence: PlatformVerificationEvidenceV1 = {
        schema: "cms.integration.platform-verification-evidence.v1",
        suiteId: definition.suiteId,
        suiteDigest,
        applicability: definition.applicability,
        outcome: "passed",
        checks: definition.checks.map((checkId) => ({
            checkId,
            outcome: "passed",
            subjectCount: 1,
            observationDigest: DIGEST_A,
            findings: [],
            findingsTruncated: false,
        })),
    };
    const evidenceDigest = await sha256Hex(canonicalJsonBytes(evidence));
    const baseResult = await jobResult(policy, admission);
    const result = {
        ...baseResult,
        results: baseResult.results.map((entry) =>
            entry.suiteId === definition.suiteId
                ? { ...entry, evidenceDigests: [evidenceDigest], platformEvidence: evidence }
                : entry,
        ),
    };
    return { policy, admission, result, evidence };
}
