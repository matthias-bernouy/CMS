import type { ProviderCapabilityContext, CapabilitySource } from "@bernouy/ulvia-sdk";
import type { ResourceInitializationService } from "resources/initialization/lifecycle/service";
import type { z } from "zod";
import type { initializationStatusSchema, operationStateSchema } from "resources/application/schemas/status";

export type ResourceInvocationContext = ProviderCapabilityContext<CapabilitySource>;
export type ResourceInitializationPort = Pick<
    ResourceInitializationService,
    "instanceId" | "siteId" | "entry" | "status" | "plan" | "apply"
>;
export type ResourceOperationState = z.output<typeof operationStateSchema>;
export type ResourceInitializationStatus = z.output<typeof initializationStatusSchema>;
/** Hosts resolve verified aliases and current administrator grants, independently of durable receipts. */
export interface ResourceAdministratorPort {
    resolve(providerId: string, subjectId: string): Promise<string | null>;
    enabled(actorId: string): Promise<boolean>;
}
export interface ResourceServices {
    readonly resources: {
        readonly initialization: ResourceInitializationPort;
        readonly administrators: ResourceAdministratorPort;
        operation(siteId: string, contractId: string): Promise<ResourceOperationState>;
    };
}
