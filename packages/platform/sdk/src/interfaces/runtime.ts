import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { CapabilityOperationHandle } from "@bernouy/ulvia-contracts/protocol";
import type { ProviderHandlerOptions, ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { AdmittedProviderManifest } from "@bernouy/ulvia-providers";
import type { CapabilityFailure } from "ulvia-sdk/definitions/errors";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";

export interface KeyedExecution {
    readonly providerId: string;
    readonly instanceId: string;
    readonly siteId: string;
    readonly contractId: string;
    readonly version: string;
    readonly capabilityId: string;
    readonly key: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly context: ProviderCapabilityInvocationContext;
}

export interface CapabilityFailurePresentation {
    readonly output?: unknown;
    readonly responseHeaders?: Readonly<Record<string, string>>;
    readonly reason?: string;
}

export interface CapabilityFailurePresentationContext {
    readonly contractId: string;
    readonly status: number;
    readonly invocation: ProviderCapabilityInvocationContext;
}

export type ImplementationRelease = Readonly<{ contractId: string; version: string; digest: string }>;

/** Metadata and captured terminal execution for one requested contract/capability across exact versions. */
export interface ProviderOperationRegistration {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly versions: readonly Readonly<{ version: string; digest: string; capability: CapabilityDefinition }>[];
    execute(input: Readonly<Record<string, unknown>>, context: ProviderCapabilityInvocationContext): Promise<unknown>;
}
export interface ProviderOperationInvocation {
    readonly providerId: string;
    readonly siteId: string;
    readonly instanceId: string;
    readonly release: ImplementationRelease;
    readonly capabilityId: string;
    readonly key?: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly context: ProviderCapabilityInvocationContext;
}
/** The host owns durable queueing, receipts, scheduling, leases and recovery. No default adapter is supplied. */
export interface ProviderOperationAdapter {
    register(operation: ProviderOperationRegistration): void;
    enqueue(invocation: ProviderOperationInvocation): Promise<CapabilityOperationHandle>;
}

export interface ProviderRegistrationOptions {
    /** Exact subset admitted by the host; omission mounts every compiled implementation. */
    readonly implementations?: readonly ImplementationRelease[];
    readonly providerId: string;
    readonly scope: { readonly siteId: string; readonly instanceId: string };
    /** Host-owned presentation of declared failures; formatted payloads must still satisfy the contract. */
    readonly formatCapabilityFailure?: (
        failure: CapabilityFailure,
        context: CapabilityFailurePresentationContext,
    ) => CapabilityFailurePresentation;
    readonly operations?: ProviderOperationAdapter;
    /** Host-owned durable deduplication for synchronous commands and complete alternative keyed handlers. */
    readonly executeKeyed?: (invocation: KeyedExecution, execute: () => Promise<unknown>) => Promise<unknown>;
}

export interface ProviderRuntimeOptions extends Omit<ProviderRegistrationOptions, "providerId" | "implementations"> {
    readonly logger?: ProviderHandlerOptions["logger"];
    readonly authenticate: ProviderHandlerOptions["authenticate"];
    /** Explicit host policy is required; verified credentials alone do not grant execution. */
    readonly authorize: NonNullable<ProviderHandlerOptions["authorize"]>;
}

export interface ProviderRuntime {
    readonly manifest: AdmittedProviderManifest;
    readonly contracts: readonly ResolvedContract[];
    readonly fetch: (request: Request) => Promise<Response>;
}
