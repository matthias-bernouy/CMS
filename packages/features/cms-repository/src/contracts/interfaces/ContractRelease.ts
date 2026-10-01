import type { HttpBindingDefinition } from "./HttpBinding";
import type { UlviaObjectSchema, UlviaSchema } from "./UlviaSchema";
import type { ReleaseDigest } from "../core/admission/digest";

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

/** Binary schema leaves in mock values use { assetId: string } instead of inline bytes. */
export type CapabilityMockOutcome =
    | { readonly kind: "success"; readonly output: unknown }
    | { readonly kind: "error"; readonly code: string; readonly output?: unknown };

export interface CapabilityMockDefinition {
    readonly id: string;
    readonly description?: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly outcome: CapabilityMockOutcome;
}

export interface ContractFixtureAssetDefinition {
    readonly id: string;
    readonly mediaType: string;
    readonly byteLength: number;
    readonly digest: ReleaseDigest;
}

/** Optional discovery metadata. Icon names are rendered by the consuming CMS. */
export interface ContractCatalogueMetadata {
    readonly categories?: readonly string[];
    readonly icon?: string;
}

/** A mandatory, provider-neutral capability needed to fulfill this capability. */
export interface CapabilityRequirement {
    readonly contractId: string;
    readonly capabilityId: string;
    /** Accepted dependency versions; OR spelling does not define a test matrix. */
    readonly versionRange: string;
    /** Explicit support/test ranges covering the accepted set; defaults to [versionRange]. */
    readonly supportRanges?: readonly string[];
}

/** Declares that a synchronous binary query is addressable through CMS media URLs. */
export interface CapabilityMediaDefinition {
    /** Protocol v1 uses the required string input `fileId` as the provider-owned media identity. */
    readonly idInput: "fileId";
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
    readonly media?: CapabilityMediaDefinition;
    readonly requires?: readonly CapabilityRequirement[];
    readonly mocks?: readonly CapabilityMockDefinition[];
    readonly deprecation?: CapabilityDeprecation;
}

export interface ContractRelease {
    readonly catalogue?: ContractCatalogueMetadata;
    readonly capabilities: readonly CapabilityDefinition[];
    readonly fixtureAssets?: readonly ContractFixtureAssetDefinition[];
    readonly contractId: string;
    readonly description?: string;
    readonly kind: "contract";
    readonly name: string;
    readonly protocol: "ulvia-provider/v1";
    readonly publisherId: string;
    readonly schemaDialect: "ulvia-schema/v1";
    readonly version: string;
}
