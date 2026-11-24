import type { WorkflowArtifacts, WorkflowInstallationStore } from "./installations";
import type { EventSubscriptionConfiguration } from "@bernouy/cms-events";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { GatewayResult } from "@bernouy/cms-gateway";
import type { EventMessage } from "@bernouy/cms-gateway/events";
import type { WorkflowStore, WorkflowValues } from "./store";
import type { WorkflowContracts, WorkflowCapability } from "./definition";
export interface WorkflowAuthority {
    callAncestry(context: ProviderCapabilityInvocationContext): Promise<readonly string[]>;
    administrator(context: ProviderCapabilityInvocationContext): Promise<string>;
    assertAdministrator(administratorId: string): Promise<void>;
    assertEventDelivery(
        context: ProviderCapabilityInvocationContext,
        event: Pick<EventMessage, "consumerContractId">,
    ): Promise<void>;
}
export interface WorkflowExecution {
    invoke(
        target: WorkflowCapability,
        input: unknown,
        administratorId: string,
        idempotencyKey?: string,
        causation?: readonly string[],
    ): Promise<GatewayResult>;
    operation(
        target: WorkflowCapability,
        operationId: string,
    ): Promise<{
        state: "waiting" | "succeeded" | "failed";
        output?: unknown;
        errorCode?: string;
        errorOutput?: unknown;
    }>;
}
export interface WorkflowDomainSubscriptions {
    ensure(
        id: string,
        configuration: EventSubscriptionConfiguration,
        expectedRevision: number,
    ): Promise<{ readonly revision: number }>;
    disable(id: string): Promise<{ readonly revision: number }>;
    disable(id: string): Promise<{ readonly revision: number }>;
    remove(id: string): Promise<void>;
}
export interface WorkflowServices {
    readonly artifacts: WorkflowArtifacts;
    readonly installationStore: WorkflowInstallationStore;
    readonly domainSubscriptions: WorkflowDomainSubscriptions;
    readonly store: WorkflowStore;
    readonly values: WorkflowValues;
    readonly contracts: WorkflowContracts;
    readonly authority: WorkflowAuthority;
    readonly execution: WorkflowExecution;
    readonly now: () => number;
}
