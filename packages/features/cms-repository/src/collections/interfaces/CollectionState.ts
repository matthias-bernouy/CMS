import type { CollectionResourceDeprecation } from "./CollectionRelease";
import type { UlviaSchema } from "cms-repository/exports/contracts/schema";

export type CollectionStateScope = "param" | "page" | "session" | "persistent";

/** A collection-owned browser synchronization contract. Runtime keys are `${collectionId}-${id}`. */
export interface CollectionState {
    readonly deprecation?: CollectionResourceDeprecation;
    readonly id: string;
    readonly scope: CollectionStateScope;
    readonly schema: UlviaSchema;
}
