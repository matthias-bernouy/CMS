import type { CollectionCapabilityRequirement, CollectionConfiguration } from "./CollectionRelease";

export interface CollectionSlot {
    readonly accepts?: readonly string[];
    readonly min?: number;
    readonly max?: number;
}

interface CollectionBlocBase {
    /** A stable custom-element tag prefixed by the collection ID. */
    readonly id: string;
    readonly description?: string;
    readonly internal?: boolean;
    readonly thumbnail?: string;
    readonly uses: readonly string[];
    readonly requires: readonly CollectionCapabilityRequirement[];
    readonly slots: Readonly<Record<string, CollectionSlot>>;
    /** Editable initial page content, distinct from the fixed composition. */
    readonly defaultContent?: string;
}

export interface CollectionComponent extends CollectionBlocBase {
    readonly kind: "component";
    /** Static shadow shell; dynamic bindings belong to the light DOM. */
    readonly shadowdom: string;
    readonly lightdom?: string;
    readonly style?: string;
    readonly settings?: CollectionConfiguration;
}

export interface CollectionComposition extends CollectionBlocBase {
    readonly kind: "composition";
    /** Expanded into light DOM: the authoring host does not survive delivery. */
    readonly lightdom: string;
}

export type CollectionBloc = CollectionComponent | CollectionComposition;
