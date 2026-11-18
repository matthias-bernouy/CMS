import type { CapabilityDefinition, ContractParentReference } from "@bernouy/ulvia-contracts";

export type Variant = "nominal" | "cold" | "warm" | "large" | "history" | "concurrent" | "invalidation";

export type CapabilityTarget = Readonly<{
    key: string;
    release: ContractParentReference;
    owner: ContractParentReference;
    definition: CapabilityDefinition;
    retained: boolean;
}>;

export type CapabilityInventory = Readonly<{
    fingerprint: string;
    targets: readonly CapabilityTarget[];
    templates: readonly Readonly<{ release: ContractParentReference; capabilityIds: readonly string[] }>[];
}>;

export type Obligation = Readonly<{ target: string; binding: string; variant: Variant }>;

export type Budget = Readonly<{
    latencyMs: number;
    mongoOperations: number;
    documentsExamined: number;
    internalRequests: number;
    requestBytes: number;
    responseBytes: number;
}>;

export type ScenarioDefinition = Readonly<{
    id: string;
    version: number;
    fixture: string;
    obligations: readonly Obligation[];
    budget: Budget;
    samples: number;
    load?: Readonly<{ concurrency: number; minimumRequestsPerMinute: number }>;
}>;

export type InvocationWitness = Readonly<{
    target: string;
    binding: string;
    traceId: string;
    durationMs: number;
    success: boolean;
    epoch?: string;
    firstInProcess?: boolean;
}>;

export type WorkMetrics = Readonly<{
    mongoOperations: number;
    documentsExamined: number;
    keysExamined: number;
    documentsReturned: number;
    internalRequests: number;
    internalResponseBytes: number;
    instrumentationComplete: boolean;
}>;

export type DependencyMetrics = Readonly<{
    service: "dns" | "smtp";
    requests: number;
    requestBytes: number;
    responseBytes: number;
    complete: boolean;
}>;

export type Measurement = Readonly<{
    scenario: string;
    phase: "preparation" | "measurement";
    obligation: Obligation;
    traceId: string;
    durationMs: number;
    requestBytes: number;
    responseBytes: number;
    status: number;
    error?: string;
    relatedTraces?: readonly string[];
    operation?: Readonly<{ polls: number }>;
    dependencies?: readonly DependencyMetrics[];
    validated: boolean;
    completed: boolean;
    streamConsumed: boolean;
    work: WorkMetrics;
    invocations: readonly InvocationWitness[];
    network?: readonly Readonly<{ path: string; requests: number; responseBytes: number }>[];
    phases?: readonly Readonly<{ name: string; calls: number; failed: number; totalMs: number; maxMs: number }>[];
    breakdown?: Readonly<{
        handlerMs: number;
        businessMongoOperations: number;
        commonMongoOperations: number;
        businessDocumentsExamined: number;
        commonDocumentsExamined: number;
        businessInternalRequests: number;
        commonInternalRequests: number;
        pollMongoOperations?: number;
        pollDocumentsExamined?: number;
        pollInternalRequests?: number;
    }>;
}>;

export type ScenarioResult = Readonly<{
    scenario: string;
    status: "passed" | "failed" | "blocked";
    failure?: string;
    measurements: readonly Measurement[];
    load?: Readonly<{
        concurrency: number;
        requests: number;
        elapsedMs: number;
        requestsPerMinute: number;
        errors: number;
        timeouts: number;
    }>;
}>;

export type Finding = Readonly<{
    code: string;
    scenario?: string;
    obligation?: Obligation;
    message: string;
}>;

export function obligationKey(value: Obligation): string {
    return JSON.stringify([value.target, value.binding, value.variant]);
}
