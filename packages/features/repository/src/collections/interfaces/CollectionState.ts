import type { CollectionResourceDeprecation } from "./CollectionRelease";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";

export type CollectionStateScope = "param" | "page" | "session" | "persistent";

/** A collection-owned browser synchronization contract. Runtime keys are the reversible collection runtime namespace plus the local state ID. */
export interface CollectionState {
    readonly deprecation?: CollectionResourceDeprecation;
    readonly id: string;
    readonly scope: CollectionStateScope;
    readonly schema: UlviaSchema;
}
