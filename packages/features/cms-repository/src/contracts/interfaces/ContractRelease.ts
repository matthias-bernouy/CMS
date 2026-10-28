import type { CapabilityBinding } from "./CapabilityBinding";
import type { UlviaObjectSchema, UlviaSchema } from "./UlviaSchema";
import type { ReleaseDigest } from "../core/admission/digest";

export type CapabilityAccess = "admin" | "authenticated" | "public";
export type CapabilityExecution = "operation" | "sync";
export type CapabilityResponseEffect = "session";

/**
 * Queries do not change business state, so they need no idempotency declaration.
 * Commands must state whether replay is naturally safe, deduplicated by an
 * invocation key, or has no guarantee and must not be retried automatically.
 * Execution is independent: an operation returns a handle before its result.
 * Sensitivity is independent of access/effect and filters delegated authority.
 */
export type CapabilityBehavior =
    | { readonly effect: "query"; readonly execution: CapabilityExecution; readonly sensitive: boolean }
    | {
          readonly effect: "command";
          readonly sensitive: boolean;
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
interface ContractCatalogueMetadata {
    readonly categories?: readonly string[];
    readonly icon?: string;
}

/** Exact immutable parent implemented by this specialized contract. */
export interface ContractParentReference {
    readonly contractId: string;
    readonly version: string;
    readonly digest: ReleaseDigest;
}

interface CapabilityCommon {
    readonly id: string;
    readonly description?: string;
    readonly access: CapabilityAccess;
    readonly behavior: CapabilityBehavior;
    readonly input: UlviaObjectSchema;
    readonly output: UlviaSchema;
    readonly errors: readonly CapabilityErrorDefinition[];
    /** Trusted HTTP-boundary effects a successful response may request. */
    readonly responseEffects?: readonly CapabilityResponseEffect[];
    readonly mocks?: readonly CapabilityMockDefinition[];
    readonly deprecation?: CapabilityDeprecation;
}

export type CapabilityDefinition = CapabilityCommon & { readonly bindings: readonly CapabilityBinding[] };

export interface ContractRelease {
    readonly catalogue?: ContractCatalogueMetadata;
    readonly capabilities: readonly CapabilityDefinition[];
    readonly fixtureAssets?: readonly ContractFixtureAssetDefinition[];
    readonly contractId: string;
    readonly description?: string;
    readonly extends?: ContractParentReference;
    readonly kind: "contract";
    readonly name: string;
    readonly protocol: "ulvia-provider/v1";
    readonly publisherId: string;
    readonly schemaDialect: "ulvia-schema/v1";
    readonly version: string;
}
