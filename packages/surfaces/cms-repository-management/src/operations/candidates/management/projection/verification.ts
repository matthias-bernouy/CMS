import { isDeepStrictEqual } from "node:util";
import {
    identifyAdmissionInputSnapshot,
    type AdmissionInputSnapshotV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";

export async function projectCandidateVerification(
    admission: AdmissionInputSnapshotV1,
    result: VerificationJobResultV1 | undefined,
) {
    if (result) {
        await assertExactResult(admission, result);
    }
    const planned = new Map(admission.suites.map((suite) => [suite.suiteId, suite]));
    const results = result?.results.map((entry) => {
        const suite = planned.get(entry.suiteId);
        if (!suite) {
            throw new TypeError(`Candidate result contains unplanned suite ${entry.suiteId}`);
        }
        return {
            suiteId: suite.suiteId,
            source: suite.source,
            contentDigest: suite.contentDigest,
            ...(suite.applicable === undefined ? {} : { applicable: suite.applicable }),
            outcome: entry.outcome,
            durationMs: entry.durationMs,
            attempts: entry.attempts,
            cacheHit: entry.cacheHit,
            diagnostics: entry.diagnostics.map(({ code }) => ({ code, redacted: true as const })),
        };
    });
    if (results && results.length !== admission.suites.length) {
        throw new TypeError("Candidate result does not cover its exact admission suites");
    }
    return {
        state: result ? ("completed" as const) : ("planned" as const),
        bindings: {
            candidateId: admission.candidate.candidateId,
            candidateDigest: admission.candidate.candidateDigest,
            packageDigest: admission.candidate.packageDigest,
            verificationDigest: admission.candidate.verificationDigest,
            policyDigest: admission.policyDigest,
            ...(admission.behavioralRlsPlan ? { behavioralRlsPlanDigest: admission.behavioralRlsPlan.digest } : {}),
        },
        runner: result?.runner ?? admission.selectedRunner,
        ...(result
            ? {
                  environment: {
                      digest: result.environment.digest,
                      versions: result.environment.versions.map(({ name, version }) => ({ name, version })),
                  },
                  outcome: verificationOutcome(result),
                  suites: results!,
              }
            : {
                  suites: admission.suites.map((suite) => ({
                      suiteId: suite.suiteId,
                      source: suite.source,
                      contentDigest: suite.contentDigest,
                      ...(suite.applicable === undefined ? {} : { applicable: suite.applicable }),
                  })),
              }),
    };
}

async function assertExactResult(admission: AdmissionInputSnapshotV1, result: VerificationJobResultV1): Promise<void> {
    const expected = {
        admissionDigest: (await identifyAdmissionInputSnapshot(admission)).digest,
        candidateDigest: admission.candidate.candidateDigest,
        packageDigest: admission.candidate.packageDigest,
        verificationDigest: admission.candidate.verificationDigest,
        policyDigest: admission.policyDigest,
        reviewedBaselineRevisionIds: admission.reviewedBaselines.map(({ revisionId }) => revisionId),
        reviewedBaselineDigests: admission.reviewedBaselines.map(({ baselineDigest }) => baselineDigest),
        reviewedObservedSchemaDigests: admission.reviewedBaselines.map(
            ({ observedSchemaDigest }) => observedSchemaDigest,
        ),
        dependencyDigests: admission.dependencies.map(({ packageDigest }) => packageDigest),
        activeContractDigests: admission.activeContracts.map(({ contractDigest }) => contractDigest),
        suiteContentDigests: admission.suites.map(({ contentDigest }) => contentDigest).toSorted(),
        catalogRevisionDigest: admission.catalogRevision.digest,
        compatibilityRevisionDigest: admission.compatibilityRevision.digest,
        compatibilityEvaluatorInputDigest: admission.compatibilityRevision.evaluatorInputDigest,
        ...(admission.behavioralRlsPlan ? { behavioralRlsPlanDigest: admission.behavioralRlsPlan.digest } : {}),
    };
    if (
        result.candidateId !== admission.candidate.candidateId ||
        result.runner.name !== admission.selectedRunner.name ||
        result.runner.version !== admission.selectedRunner.version ||
        result.runner.imageDigest !== admission.selectedRunner.imageDigest ||
        !isDeepStrictEqual(result.bindings, expected)
    ) {
        throw new TypeError("Candidate verification result substitutes its exact admission plan");
    }
}

function verificationOutcome(result: VerificationJobResultV1): "passed" | "failed" | "infrastructure-failure" {
    return result.results.some((suite) => suite.outcome === "infrastructure-failure")
        ? "infrastructure-failure"
        : result.results.some((suite) => suite.outcome === "failed" || suite.outcome === "skipped")
          ? "failed"
          : "passed";
}
