import type { ProviderCapabilityHandler } from "ulvia-sdk/interfaces/handlers";
import type { CapabilitySource } from "ulvia-sdk/interfaces/capabilities";
import type { CapabilityFail } from "ulvia-sdk/definitions/errors";

// Type-only port requirements survive capability authoring without constructing service instances.
declare const capabilityServices: unique symbol;
export interface CapabilityServiceRequirement<Services> {
    readonly [capabilityServices]: (services: Services) => void;
}

export interface CapabilityExecutionContext<Capability extends CapabilitySource, Services> {
    readonly input: Parameters<ProviderCapabilityHandler<Capability>>[0];
    readonly services: Services;
    readonly context: Parameters<ProviderCapabilityHandler<Capability>>[1];
    readonly fail: CapabilityFail<Capability>;
}

export type CapabilityExecutor<Capability extends CapabilitySource, Services> = (
    execution: CapabilityExecutionContext<Capability, Services>,
) => ReturnType<ProviderCapabilityHandler<Capability>>;

export type ExecutableCapability = CapabilitySource & { readonly execute: (execution: never) => unknown };

export type CapabilityServices<Capability extends CapabilitySource> =
    Capability extends CapabilityServiceRequirement<infer Services>
        ? Services
        : Capability extends ExecutableCapability
          ? Parameters<Capability["execute"]>[0] extends { readonly services: infer Services }
              ? Services
              : {}
          : {};
