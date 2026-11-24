import type { CapabilityDeprecation } from "./ContractRelease";
import type { UlviaSchema } from "./UlviaSchema";

/** A business fact emitted by an implementation; its version belongs to the declaring contract. */
export interface ContractEventDefinition {
    readonly id: string;
    readonly description?: string;
    readonly schema: UlviaSchema;
    readonly sensitive: boolean;
    readonly filterKeys?: readonly string[];
    readonly docs?: readonly string[];
    readonly deprecation?: CapabilityDeprecation;
}
