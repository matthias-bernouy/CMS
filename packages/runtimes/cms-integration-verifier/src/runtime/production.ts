import {
    readIntegrationVerifierRuntimeEnv,
    readIntegrationVerifierWorkerToken,
    type IntegrationVerifierEnvSource,
} from "../config";
import { createHttpCandidateWorkerClient } from "../protocol";
import {
    createVerificationSupervisor,
    type DisposableVerificationDatabaseProvider,
    type VerificationRenewalScheduler,
    type VerificationSandbox,
    type VerificationSupervisor,
} from "../supervisor";

export type ProductionIntegrationVerifierConfig = Readonly<{
    env?: IntegrationVerifierEnvSource;
    sandbox: VerificationSandbox;
    databases: DisposableVerificationDatabaseProvider;
    scheduler?: VerificationRenewalScheduler;
    fetch?: typeof fetch;
}>;

export async function createProductionIntegrationVerifier(
    config: ProductionIntegrationVerifierConfig,
): Promise<VerificationSupervisor> {
    const env = readIntegrationVerifierRuntimeEnv(config.env ?? process.env);
    const workerToken = await readIntegrationVerifierWorkerToken(env.workerTokenFile);
    const client = createHttpCandidateWorkerClient({
        repositoryUrl: env.repositoryUrl,
        workerId: env.workerId,
        workerToken,
        requestTimeoutMs: env.requestTimeoutMs,
        maxResponseBytes: env.maxResponseBytes,
        ...(config.fetch ? { fetch: config.fetch } : {}),
    });
    return createVerificationSupervisor({
        client,
        sandbox: config.sandbox,
        databases: config.databases,
        ...(config.scheduler ? { scheduler: config.scheduler } : {}),
        jobListLimit: env.jobListLimit,
        leaseRenewalIntervalMs: env.leaseRenewalIntervalMs,
    });
}
