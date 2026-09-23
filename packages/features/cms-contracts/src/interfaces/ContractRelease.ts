import type { HttpBindingDefinition } from "./HttpBinding";
import type { UlviaObjectSchema, UlviaSchema } from "./UlviaSchema";

export type CapabilityAccess = "admin" | "authenticated" | "public";
export type CapabilityExecution = "operation" | "sync";

/**
 * Queries do not change business state, so they need no idempotency declaration.
 * Commands must state whether replay is naturally safe, deduplicated by an
 * invocation key, or has no guarantee and must not be retried automatically.
 * Execution is independent: an operation returns a handle before its result.
 */
export type CapabilityBehavior =
    | { readonly effect: "query"; readonly execution: CapabilityExecution }
    | {
          readonly effect: "command";
          readonly execution: CapabilityExecution;
          readonly idempotency: "keyed" | "natural" | "none";
      };

/** Admission requires at least one of these deprecation fields. */
export interface CapabilityDeprecation {
    readonly reason?: string;
    readonly replacedBy?: string;
    readonly sunsetAt?: string;
}

export interface CapabilityErrorDefinition {
    readonly code: string;
    readonly description?: string;
    readonly output?: UlviaSchema;
    readonly retryable: boolean;
}

export interface CapabilityDefinition {
    readonly id: string;
    readonly description?: string;
    readonly access: CapabilityAccess;
    readonly behavior: CapabilityBehavior;
    readonly input: UlviaObjectSchema;
    readonly output: UlviaSchema;
    readonly errors: readonly CapabilityErrorDefinition[];
    readonly binding: HttpBindingDefinition;
    readonly deprecation?: CapabilityDeprecation;
}

export interface ContractRelease {
    readonly capabilities: readonly CapabilityDefinition[];
    readonly contractId: string;
    readonly description?: string;
    readonly kind: "contract";
    readonly name: string;
    readonly protocol: "ulvia-provider/v1";
    readonly publisherId: string;
    readonly schemaDialect: "ulvia-schema/v1";
    readonly version: string;
}
