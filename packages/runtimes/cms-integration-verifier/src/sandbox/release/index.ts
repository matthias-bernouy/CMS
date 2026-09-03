import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    RELEASE_RUNTIME_PLATFORM_SUITE_ID,
    type CandidateAdmissionJobResultV1,
    type PlatformVerificationEvidenceV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import { loadUpgradeFixtureSuiteFromVerification } from "@bernouy/cms-integration-verification/bun";
import { executeReleaseVerificationPlan } from "@bernouy/ulvia-cli/release-runtime";
import type { VerificationSandboxInput } from "../../supervisor";
import { verificationResultBindings } from "./bindings";
import { releaseRuntimeDiagnostics, releaseRuntimeEnvironmentVersions, releaseRuntimeEvidence } from "./evidence";
import { loadExactReleaseRuntimePackages } from "./packages";

export async function runReleaseRuntimeVerification(
    input: VerificationSandboxInput,
    signal: AbortSignal,
): Promise<CandidateAdmissionJobResultV1> {
    const startedAt = performance.now();
    const planned = input.workload.admission.suites.find(
        (entry) => entry.source === "platform" && entry.suiteId === RELEASE_RUNTIME_PLATFORM_SUITE_ID,
    );
    const releasePlan = input.workload.admission.releaseVerificationPlan;
    if (!planned || planned.applicable === false || !releasePlan) {
        throw new TypeError("Release runtime requires an applicable server-owned release plan suite");
    }
    signal.throwIfAborted();
    const packages = await loadExactReleaseRuntimePackages(input);
    const fixtures = await loadUpgradeFixtureSuiteFromVerification(input.workload.verification);
    const execution = await executeReleaseVerificationPlan({
        ...packages,
        plan: releasePlan.plan,
        fixtures,
        continueOnFailure: true,
        onScenario: () => signal.throwIfAborted(),
    });
    const platformEvidence = await releaseRuntimeEvidence(planned.contentDigest, releasePlan.digest, execution);
    const environmentVersions = releaseRuntimeEnvironmentVersions();
    const admissionDigest = (await identifyAdmissionInputSnapshot(input.workload.admission)).digest;
    const evidenceDigest = await sha256Hex(canonicalJsonBytes(platformEvidence));
    const result: VerificationJobResultV1 = {
        schema: "cms.integration.verification-job-result.v1",
        candidateId: input.workload.admission.candidate.candidateId,
        ...input.workload.attempt,
        bindings: verificationResultBindings(input, admissionDigest),
        runner: input.workload.admission.selectedRunner,
        environment: {
            digest: await sha256Hex(canonicalJsonBytes(environmentVersions)),
            versions: environmentVersions,
        },
        results: [
            {
                suiteId: planned.suiteId,
                outcome: platformEvidence.outcome,
                durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
                attempts: 1,
                cacheHit: false,
                evidenceDigests: [evidenceDigest],
                diagnostics: releaseRuntimeDiagnostics(platformEvidence),
                platformEvidence,
            },
        ],
    };
    return { schema: "cms.integration.candidate-admission-job-result.v1", verification: result, migrations: [] };
}
