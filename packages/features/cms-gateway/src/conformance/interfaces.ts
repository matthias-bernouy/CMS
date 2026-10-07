import type {
    AdmittedContractRelease,
    ConformanceActor,
    ConformanceCompletion,
    ConformanceDependencyRelease,
    VerifiedFixtureAsset,
} from "@bernouy/cms-repository/contracts";

export type ConformanceInvocationOutcome =
    | { readonly kind: "success"; readonly output: unknown }
    | { readonly kind: "error"; readonly code: string; readonly output?: unknown };

export type ConformanceInvocationResult =
    | ConformanceInvocationOutcome
    | { readonly kind: "accepted"; readonly operationId: string };

export interface ConformanceInvocationRequest {
    readonly release: AdmittedContractRelease;
    readonly capabilityId: string;
    readonly actor: ConformanceActor;
    readonly input: Readonly<Record<string, unknown>>;
    readonly invocationKey?: string;
    readonly fixtures: ReadonlyMap<string, VerifiedFixtureAsset>;
}

export interface ConformanceScenarioEnvironment {
    invoke(request: ConformanceInvocationRequest): Promise<ConformanceInvocationResult>;
    complete(operationId: string, policy: ConformanceCompletion): Promise<ConformanceInvocationOutcome>;
    dispose(): Promise<void>;
}

export interface ConformanceEnvironmentFactory {
    provision(input: {
        readonly runId: string;
        readonly scenarioId: string;
        readonly profileId?: string;
        readonly dependencies: readonly ConformanceDependencyRelease[];
    }): Promise<ConformanceScenarioEnvironment>;
}

export interface ConformanceProviderIdentity {
    readonly publisherId: string;
    readonly providerId: string;
    readonly manifestVersion: string;
    readonly manifestDigest: `sha256:${string}`;
    readonly buildVersion: string;
}

export class ConformanceExecutionError extends Error {
    constructor(
        readonly code: string,
        message: string,
    ) {
        super(message);
    }
}
