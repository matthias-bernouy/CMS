import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyPlatformVerificationSuiteDefinition,
    parsePlatformVerificationEvidence,
    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1,
    type AdmissionInputSnapshotV1,
    type PlatformVerificationEvidenceV1,
} from "@bernouy/cms-integration-verification";

export async function passedSuiteResult(suite: AdmissionInputSnapshotV1["suites"][number]) {
    if (suite.source !== "platform" || suite.applicable === undefined) {
        return {
            suiteId: suite.suiteId,
            outcome: "passed" as const,
            durationMs: 10,
            attempts: 1,
            cacheHit: false,
            evidenceDigests: ["e".repeat(64)],
            diagnostics: [],
        };
    }
    const definition = POSTGRES_PLATFORM_VERIFICATION_SUITES_V1.find((entry) => entry.suiteId === suite.suiteId);
    if (!definition || (await identifyPlatformVerificationSuiteDefinition(definition)).digest !== suite.contentDigest) {
        throw new TypeError(`Fixture cannot fabricate unknown platform suite ${suite.suiteId}`);
    }
    const outcome = suite.applicable ? "passed" : "not-applicable";
    const evidence: PlatformVerificationEvidenceV1 = {
        schema: "cms.integration.platform-verification-evidence.v1",
        suiteId: suite.suiteId,
        suiteDigest: suite.contentDigest,
        applicability: definition.applicability,
        outcome,
        checks: definition.checks.map((checkId) => ({
            checkId,
            outcome,
            subjectCount: suite.applicable ? 1 : 0,
            observationDigest: "f".repeat(64),
            findings: [],
            findingsTruncated: false,
        })),
    };
    const parsedEvidence = parsePlatformVerificationEvidence(evidence);
    return {
        suiteId: suite.suiteId,
        outcome,
        durationMs: 10,
        attempts: 1,
        cacheHit: false,
        evidenceDigests: [await sha256Hex(canonicalJsonBytes(parsedEvidence))],
        diagnostics: [],
        platformEvidence: parsedEvidence,
    };
}
