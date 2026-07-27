import { randomBytes, randomUUID } from "node:crypto";
import {
    FsIntegrationRegistryCandidateStore,
    recoverFsIntegrationRegistryCandidates,
    type FsIntegrationRegistryCandidateRecoveryResult,
} from "@bernouy/cms-integration-registry/fs";
import {
    createRepositoryCandidateAdmissionCoordinator,
    createRepositoryCandidateCapabilityAuthority,
    mountRepositoryCandidateAuthenticatedWorkerRoutes,
    mountRepositoryCandidateCapabilityRoutes,
    mountRepositoryCandidateManagementRoutes,
    RepositoryCandidateAdmissionPlanningError,
    type RepositoryCandidateAdmissionPlanner,
    type RepositoryCandidatePublicationFinalizer,
    type RepositoryCandidateWorkerRoutesConfig,
} from "@bernouy/cms-repository-management";
import type { Runner } from "@bernouy/http-runner";

const MAX_CANDIDATE_UPLOAD_BYTES = 64 * 1_024 * 1_024;
const MAX_WORKER_CONTROL_BYTES = 64 * 1_024;
const MAX_VERIFICATION_RESULT_BYTES = 8 * 1_024 * 1_024;
const DEFAULT_CANDIDATE_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_WORKER_LEASE_MS = 5 * 60 * 1_000;

export type ProductionRepositoryCandidateProtocolConfig = Readonly<{
    root: string;
    capabilitySigningKey?: string;
    candidateTtlMs?: number;
    leaseDurationMs?: number;
    now?: () => string;
    plan?: RepositoryCandidateAdmissionPlanner;
    publication?: RepositoryCandidatePublicationFinalizer;
    packageSource?: RepositoryCandidateWorkerRoutesConfig["packageSource"];
    store?: FsIntegrationRegistryCandidateStore;
}>;

export type ProductionRepositoryCandidateProtocol = Readonly<{
    recovery: FsIntegrationRegistryCandidateRecoveryResult;
    mountManagement(runner: Runner): void;
    mountWorkerAuthenticated(runner: Runner): void;
    mountWorkerCapabilities(runner: Runner): void;
}>;

export async function createProductionRepositoryCandidateProtocol(
    config: ProductionRepositoryCandidateProtocolConfig,
): Promise<ProductionRepositoryCandidateProtocol> {
    const now = config.now ?? (() => new Date().toISOString());
    const store = config.store ?? new FsIntegrationRegistryCandidateStore({ root: config.root });
    const recovery = await recoverFsIntegrationRegistryCandidates({ root: config.root, now: now() });
    const admission = createRepositoryCandidateAdmissionCoordinator({
        store,
        now,
        plan:
            config.plan ??
            (async () => {
                throw new RepositoryCandidateAdmissionPlanningError("admission_planner_unavailable");
            }),
    });
    const worker = {
        store,
        capabilityAuthority: createRepositoryCandidateCapabilityAuthority({
            signingKey: config.capabilitySigningKey ?? randomBytes(32).toString("base64url"),
        }),
        maxBodyBytes: MAX_WORKER_CONTROL_BYTES,
        maxResultBodyBytes: MAX_VERIFICATION_RESULT_BYTES,
        leaseDurationMs: config.leaseDurationMs ?? DEFAULT_WORKER_LEASE_MS,
        now,
        createJobId: () => randomUUID(),
        createAttemptId: () => randomUUID(),
        ...(config.packageSource ? { packageSource: config.packageSource } : {}),
        ...(config.publication ? { publication: config.publication } : {}),
    };
    return Object.freeze({
        recovery,
        mountManagement(runner: Runner) {
            mountRepositoryCandidateManagementRoutes(runner, {
                store,
                admission,
                maxBodyBytes: MAX_CANDIDATE_UPLOAD_BYTES,
                candidateTtlMs: config.candidateTtlMs ?? DEFAULT_CANDIDATE_TTL_MS,
                now,
                createCandidateId: () => randomUUID(),
            });
        },
        mountWorkerAuthenticated(runner: Runner) {
            mountRepositoryCandidateAuthenticatedWorkerRoutes(runner, worker);
        },
        mountWorkerCapabilities(runner: Runner) {
            mountRepositoryCandidateCapabilityRoutes(runner, worker);
        },
    });
}
