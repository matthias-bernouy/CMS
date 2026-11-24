import type { ResolvedSchemaBinding, ResolvedSchemaResult } from "@bernouy/ulvia-contracts/resolution";
import type { EventDefinition } from "@bernouy/cms-events";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { SubscriptionTarget } from "@bernouy/cms-gateway/events";
export type {
    WorkflowExpression,
    WorkflowStep,
    WorkflowTriggerSource,
    WorkflowDefinition,
} from "@bernouy/ulvia-workflows";
import type { WorkflowDefinition } from "@bernouy/ulvia-workflows";
export interface WorkflowCapability {
    readonly target: SubscriptionTarget;
    readonly capability: CapabilityDefinition;
    readonly operationReadable: boolean;
    readonly declaredCapability?: CapabilityDefinition;
    readonly schemaInput?: unknown;
    readonly inputBindings?: readonly ResolvedSchemaBinding[];
    readonly outputBindings?: readonly ResolvedSchemaBinding[];
}
export interface WorkflowPlan {
    readonly format: "ulvia-workflow-plan/v1";
    readonly definition: WorkflowDefinition;
    readonly capabilities: Readonly<Record<string, WorkflowCapability>>;
    readonly triggerSchema?: UlviaSchema;
    readonly eventTrigger?: EventDefinition;
    readonly eventSchemas?: readonly ResolvedSchemaBinding[];
    readonly eventFilterJson?: string;
    readonly digest: string;
    readonly parameters: unknown;
}
export interface WorkflowContracts {
    resolveEvent?(contractId: string, eventType: string): Promise<EventDefinition>;
    resolveEventSchema?(
        definition: EventDefinition,
        value: unknown,
        allowLatest?: boolean,
    ): Promise<ResolvedSchemaResult>;
    resolveSchema?(
        contractId: string,
        schema: UlviaSchema,
        value: unknown,
        input: unknown,
    ): Promise<ResolvedSchemaResult>;
    resolve(contractId: string, capabilityId: string): Promise<WorkflowCapability>;
}
