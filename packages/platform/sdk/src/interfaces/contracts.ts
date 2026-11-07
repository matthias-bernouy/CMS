import type {
    CapabilityAccess,
    CapabilityBehavior,
    CapabilityBinding,
    CapabilityDeprecation,
    CapabilityResponseEffect,
    ContractRelease,
} from "@bernouy/ulvia-contracts";
import type { OperationSource } from "ulvia-sdk/interfaces/operations";

export interface CapabilitySource {
    readonly operation: OperationSource;
    readonly access: CapabilityAccess;
    readonly behavior: CapabilityBehavior;
    readonly bindings: readonly CapabilityBinding[];
    readonly deprecation?: CapabilityDeprecation;
    readonly responseEffects?: readonly CapabilityResponseEffect[];
}

export interface ContractFixtureSource {
    readonly id: string;
    readonly mediaType: string;
    readonly bytes: Uint8Array | Blob;
}

export type ContractCapabilities = Readonly<Record<string, CapabilitySource>>;

export interface ContractDefinition<Capabilities extends ContractCapabilities = ContractCapabilities>
    extends Pick<ContractRelease, "contractId" | "name" | "publisherId" | "version" | "description" | "catalogue"> {
    /** Only capabilities introduced by this release; inherited capabilities stay in their parent. */
    readonly capabilities: Capabilities;
    readonly extends?: ContractDefinition;
    /** Explicit in-memory source map. Filesystem discovery belongs to later build tooling. */
    readonly documents?: Readonly<Record<string, string>>;
    readonly fixtures?: readonly ContractFixtureSource[];
}
