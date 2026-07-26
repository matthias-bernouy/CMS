import type {
    CreateIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateRecord,
    IntegrationRegistryCandidateStore,
} from "@bernouy/cms-integration-registry";
import type {
    RepositoryCandidateAdmissionCoordinator,
    RepositoryCandidateAdmissionPlan,
    RepositoryCandidateAdmissionPlanner,
} from "./contracts";

export class RepositoryCandidateAdmissionPlanningError extends Error {
    override readonly name = "RepositoryCandidateAdmissionPlanningError";

    constructor(readonly code: string) {
        super("Candidate could not be admitted for verification");
        if (!/^[a-z][a-z0-9_]{0,127}$/u.test(code)) {
            throw new TypeError("Candidate admission failure code is invalid");
        }
    }
}

export function createRepositoryCandidateAdmissionCoordinator(
    config: Readonly<{
        store: IntegrationRegistryCandidateStore;
        now(): string;
        plan: RepositoryCandidateAdmissionPlanner;
    }>,
): RepositoryCandidateAdmissionCoordinator {
    if (!config.store || typeof config.now !== "function" || typeof config.plan !== "function") {
        throw new TypeError("Candidate admission coordinator dependencies are required");
    }
    return Object.freeze({
        async submit(input: CreateIntegrationRegistryCandidateInput) {
            const uploaded = await config.store.create(input);
            const validating = await config.store.advanceValidation(uploaded.candidateId, {
                expectedRevision: uploaded.revision,
                now: canonicalTimestamp(config.now()),
            });
            let plan: RepositoryCandidateAdmissionPlan;
            try {
                plan = await config.plan({ candidateId: uploaded.candidateId, candidate: input.candidate });
            } catch (error) {
                return await rejectPlanning(config.store, validating, canonicalTimestamp(config.now()), error);
            }
            return await config.store.queue(uploaded.candidateId, {
                expectedRevision: validating.revision,
                now: canonicalTimestamp(config.now()),
                policy: plan.policy,
                admission: plan.admission,
            });
        },
    });
}

async function rejectPlanning(
    store: IntegrationRegistryCandidateStore,
    candidate: IntegrationRegistryCandidateRecord,
    now: string,
    error: unknown,
) {
    const code = error instanceof RepositoryCandidateAdmissionPlanningError ? error.code : "admission_planning_failed";
    return await store.rejectValidation(candidate.candidateId, {
        expectedRevision: candidate.revision,
        now,
        failure: {
            kind: "validation",
            code,
            message: "Candidate admission planning failed without exposing adapter diagnostics",
            occurredAt: now,
        },
    });
}

function canonicalTimestamp(value: string): string {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        throw new TypeError("Candidate admission clock must return a canonical timestamp");
    }
    return value;
}
