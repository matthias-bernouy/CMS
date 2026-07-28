import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    PLATFORM_VERIFICATION_EVIDENCE_SCHEMA,
    type PlatformVerificationCheckEvidenceV1,
    type PlatformVerificationEvidenceV1,
    type PlatformVerificationFindingV1,
    type PlatformVerificationSuiteDefinitionV1,
} from "@bernouy/cms-integration-verification";

const MAX_REPORTED_FINDINGS = 256;

export async function checkEvidence(
    checkId: string,
    subjects: unknown,
    findings: readonly PlatformVerificationFindingV1[],
): Promise<PlatformVerificationCheckEvidenceV1> {
    const sorted = [...findings].toSorted((left, right) => {
        const leftKey = `${left.code}\0${left.path}`;
        const rightKey = `${right.code}\0${right.path}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    return {
        checkId,
        outcome: sorted.length === 0 ? "passed" : "failed",
        subjectCount: Array.isArray(subjects) ? subjects.length : 1,
        observationDigest: await sha256Hex(canonicalJsonBytes(subjects)),
        findings: sorted.slice(0, MAX_REPORTED_FINDINGS),
        findingsTruncated: sorted.length > MAX_REPORTED_FINDINGS,
    };
}

export async function notApplicableEvidence(
    definition: PlatformVerificationSuiteDefinitionV1,
    suiteDigest: string,
): Promise<PlatformVerificationEvidenceV1> {
    const checks = await Promise.all(
        definition.checks.map(async (checkId) => ({
            checkId,
            outcome: "not-applicable" as const,
            subjectCount: 0,
            observationDigest: await sha256Hex(
                canonicalJsonBytes({ applicability: definition.applicability, applicable: false, checkId }),
            ),
            findings: [],
            findingsTruncated: false,
        })),
    );
    return {
        schema: PLATFORM_VERIFICATION_EVIDENCE_SCHEMA,
        suiteId: definition.suiteId,
        suiteDigest,
        applicability: definition.applicability,
        outcome: "not-applicable",
        checks,
    };
}

export function suiteEvidence(
    definition: PlatformVerificationSuiteDefinitionV1,
    suiteDigest: string,
    checks: readonly PlatformVerificationCheckEvidenceV1[],
): PlatformVerificationEvidenceV1 {
    const expected = [...definition.checks].toSorted();
    const actual = checks.map((entry) => entry.checkId).toSorted();
    if (expected.length !== actual.length || expected.some((entry, index) => entry !== actual[index])) {
        throw new TypeError(`Platform evidence does not contain exact checks for ${definition.suiteId}`);
    }
    return {
        schema: PLATFORM_VERIFICATION_EVIDENCE_SCHEMA,
        suiteId: definition.suiteId,
        suiteDigest,
        applicability: definition.applicability,
        outcome: checks.some((entry) => entry.outcome === "failed") ? "failed" : "passed",
        checks,
    };
}

export function finding(code: string, path: string): PlatformVerificationFindingV1 {
    return { code, path };
}
