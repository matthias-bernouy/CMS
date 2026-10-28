import type { TraceContext } from "@bernouy/logging";
export interface InvocationObservation extends TraceContext {
    readonly requestId: string;
    readonly contractId?: string;
    readonly capabilityId?: string;
    readonly installationId?: string;
    readonly version?: string;
    readonly actorKind: string;
    readonly sourceInstallationId?: string;
    readonly phase: string;
    readonly outcome: string;
    readonly code?: string;
    readonly status?: number;
    readonly durationMs: number;
    readonly requestBytes?: number;
    readonly responseBytes?: number;
    readonly phases: Readonly<Record<string, number>>;
}
export interface GatewayTracing {
    current(): TraceContext | undefined;
    run<T>(context: TraceContext, operation: () => T): T;
}
export type InvocationObserver = (event: InvocationObservation) => void | Promise<void>;
