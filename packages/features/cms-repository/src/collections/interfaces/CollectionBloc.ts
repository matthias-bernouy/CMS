import type { CollectionCapabilityRequirement } from "./CollectionRelease";

export interface CollectionSlot {
    readonly accepts?: readonly string[];
    readonly min?: number;
    readonly max?: number;
}

interface CollectionSettingBase {
    /** Safe HTML attribute name. */
    readonly id: string;
    readonly label: string;
    readonly group?: string;
    /** Editor visibility only; hidden values remain stored. */
    readonly visibleWhen?: readonly CollectionSettingVisibilityRule[];
}

export type CollectionSettingVisibilityValue = string | boolean;

export interface CollectionSettingVisibilityRule {
    readonly setting: string;
    readonly equals?: CollectionSettingVisibilityValue | readonly CollectionSettingVisibilityValue[];
    readonly notEquals?: CollectionSettingVisibilityValue | readonly CollectionSettingVisibilityValue[];
}

export type CollectionSettingItem = CollectionSettingBase &
    (
        | {
              readonly type: "string";
              readonly default: string;
              readonly enum?: readonly string[];
              readonly minLength?: number;
              readonly maxLength: number;
          }
        | { readonly type: "boolean"; readonly default: boolean }
    );

export type CollectionComponentSettings = readonly CollectionSettingItem[];

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
    readonly settings?: CollectionComponentSettings;
    /** Immutable browser bundles produced from optional local bloc source. */
    readonly runtime?: { readonly viewJS: string; readonly editorJS?: string };
}

export interface CollectionComposition extends CollectionBlocBase {
    readonly kind: "composition";
    /** Expanded into light DOM: the authoring host does not survive delivery. */
    readonly lightdom: string;
}

export type CollectionBloc = CollectionComponent | CollectionComposition;
