import type { SchemaDescriptor, UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { ProviderCapabilityInvocationContext } from "cms-gateway/provider/server/dispatch/registry";

/** Host-owned durable scope. Release versions intentionally do not reset a resource seal. */
export interface SchemaVersionScope {
    readonly siteId: string;
    readonly providerId: string;
    readonly installationId: string;
    readonly instanceId: string;
    readonly contractId: string;
    readonly resolverId: string;
}
export interface SchemaVersionStore {
    seal(scope: SchemaVersionScope, descriptor: SchemaDescriptor): Promise<void>;
}
export type ProviderSchemaResolution = (
    capability: CapabilityDefinition,
    schema: UlviaSchema,
    value: unknown,
    input: unknown,
    context: ProviderCapabilityInvocationContext,
) => Promise<UlviaSchema>;
