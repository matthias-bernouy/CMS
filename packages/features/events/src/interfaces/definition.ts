import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
export interface EventOwner {
    readonly siteId: string;
    readonly installationId: string;
    readonly namespace: string;
}
export type EventReadScope = Omit<EventOwner, "namespace"> & { readonly namespace?: string };
export interface EventDefinition {
    readonly id: string;
    readonly owner: EventOwner;
    readonly eventType: string;
    readonly version: string;
    readonly digest: string;
    readonly declaringContract: ContractParentReference;
    readonly schema: UlviaSchema;
    readonly filterKeys?: readonly string[];
    readonly sensitive: boolean;
    readonly retired: boolean;
    readonly createdAt: string;
}
export type EventDefinitionSummary = Omit<EventDefinition, "schema">;
export interface EventDefinitionReference {
    readonly id: string;
    readonly digest: string;
}
