import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    RELEASE_RUNTIME_PLATFORM_SUITE_ID,
    validateCandidateAdmissionJobResultForPlan,
} from "@bernouy/cms-integration-verification";
import { verificationResultBindings } from "../sandbox/release/bindings";
import type { VerificationSandbox, VerificationSandboxInput } from "./types";

export function createCompositeVerificationSandbox(
    input: Readonly<{
        platform: VerificationSandbox;
        releaseRuntime: VerificationSandbox;
    }>,
): VerificationSandbox {
    if (!sameIdentity(input.platform.identity, input.releaseRuntime.identity)) {
        throw new TypeError("Composite verification sandboxes must have the same pinned identity");
    }
    return Object.freeze({
        identity: input.platform.identity,
        async run(workload: VerificationSandboxInput, signal: AbortSignal) {
            const requiresRuntime = workload.workload.admission.suites.some(
                (entry) => entry.source === "platform" && entry.suiteId === RELEASE_RUNTIME_PLATFORM_SUITE_ID,
            );
            const [platform, runtime] = await runCompositeParts(input, workload, signal, requiresRuntime);
            if (runtime?.migrations.length) {
                throw new TypeError("Release runtime must not return migration evidence");
            }
            const partialResults = [...platform.verification.results, ...(runtime?.verification.results ?? [])];
            const results = new Map(partialResults.map((entry) => [entry.suiteId, entry] as const));
            if (results.size !== partialResults.length || results.size !== workload.workload.admission.suites.length) {
                throw new TypeError("Composite verification did not return every and only planned suite");
            }
            const versions = mergeEnvironmentVersions([
                ...platform.verification.environment.versions,
                ...(runtime?.verification.environment.versions ?? []),
            ]);
            const admissionDigest = (await identifyAdmissionInputSnapshot(workload.workload.admission)).digest;
            const combined = {
                schema: "cms.integration.candidate-admission-job-result.v1" as const,
                verification: {
                    schema: "cms.integration.verification-job-result.v1" as const,
                    candidateId: workload.workload.admission.candidate.candidateId,
                    ...workload.workload.attempt,
                    bindings: verificationResultBindings(workload, admissionDigest),
                    runner: workload.workload.admission.selectedRunner,
                    environment: {
                        digest: await sha256Hex(canonicalJsonBytes(versions)),
                        versions,
                    },
                    results: workload.workload.admission.suites.map((planned) => results.get(planned.suiteId)!),
                },
                migrations: platform.migrations,
            };
            return (
                await validateCandidateAdmissionJobResultForPlan(
                    combined,
                    workload.workload.migrationInputs,
                    workload.workload.admission,
                    workload.workload.policy,
                    workload.workload.attempt,
                )
            ).result;
        },
    });
}

async function runCompositeParts(
    sandboxes: Readonly<{ platform: VerificationSandbox; releaseRuntime: VerificationSandbox }>,
    workload: VerificationSandboxInput,
    signal: AbortSignal,
    requiresRuntime: boolean,
) {
    signal.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const platform = sandboxes.platform.run(workload, controller.signal);
    const runtime = requiresRuntime
        ? sandboxes.releaseRuntime.run(workload, controller.signal)
        : Promise.resolve(undefined);
    try {
        return await Promise.all([platform, runtime]);
    } catch (error) {
        controller.abort();
        await Promise.allSettled([platform, runtime]);
        throw error;
    } finally {
        signal.removeEventListener("abort", abort);
    }
}

function mergeEnvironmentVersions(
    entries: readonly Readonly<{ name: string; version: string }>[],
): readonly Readonly<{ name: string; version: string }>[] {
    const versions = new Map<string, string>();
    for (const entry of entries) {
        const existing = versions.get(entry.name);
        if (existing && existing !== entry.version) {
            throw new TypeError(`Composite verifier environment disagrees on ${entry.name}`);
        }
        versions.set(entry.name, entry.version);
    }
    return [...versions]
        .map(([name, version]) => ({ name, version }))
        .toSorted((left, right) => left.name.localeCompare(right.name));
}

function sameIdentity(left: VerificationSandbox["identity"], right: VerificationSandbox["identity"]): boolean {
    return left.name === right.name && left.version === right.version && left.imageDigest === right.imageDigest;
}
