import type { ProviderHandlerOptions, ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { AdmittedProviderManifest } from "@bernouy/ulvia-providers";
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

export interface ProviderRegistrationOptions {
    readonly providerId: string;
    readonly scope: { readonly siteId: string; readonly instanceId: string };
    /** Host-owned durable deduplication, including input equivalence and crash recovery. */
    readonly executeKeyed?: (invocation: KeyedExecution, execute: () => Promise<unknown>) => Promise<unknown>;
}

export interface ProviderRuntimeOptions extends Omit<ProviderRegistrationOptions, "providerId"> {
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
