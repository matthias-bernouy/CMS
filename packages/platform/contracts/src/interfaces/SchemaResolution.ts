import type { CapabilityDefinition } from "./ContractRelease";
import type { SchemaDescriptor, UlviaResolvedSchema, UlviaSchema } from "./UlviaSchema";
export interface ResolvedSchemaBinding {
    readonly path: string;
    readonly declaration: UlviaResolvedSchema;
    readonly selectorJson: string;
    readonly requestedVersion?: string;
    readonly descriptor: SchemaDescriptor;
}
export interface SchemaResolutionOptions {
    readonly capabilities: readonly CapabilityDefinition[];
    readonly input?: unknown;
    /** Design-time resolution may select the latest version when its metadata is not yet available. */
    readonly allowLatest?: boolean;
    readonly invoke: (
        resolver: CapabilityDefinition,
        input: { readonly selectorJson: string; readonly version?: string },
    ) => Promise<unknown>;
    readonly seal: (resolver: CapabilityDefinition, descriptor: SchemaDescriptor) => Promise<void>;
}
export interface ResolvedSchemaResult {
    readonly schema: UlviaSchema;
    readonly bindings: readonly ResolvedSchemaBinding[];
}
