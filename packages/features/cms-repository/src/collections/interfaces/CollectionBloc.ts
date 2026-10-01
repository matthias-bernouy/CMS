import type { CollectionCapabilityRequirement } from "./CollectionRelease";

export interface CollectionSlot {
    readonly accepts?: readonly CollectionSlotAccept[];
    readonly min?: number;
    readonly max?: number;
}

export type CollectionMediaAccept = "image" | "bitmap" | "svg" | "video" | "audio" | "document";

export type CollectionSlotAccept =
    | { readonly kind: "component"; readonly tag: string }
    | { readonly kind: "any-component" }
    | { readonly kind: "media"; readonly accept?: readonly CollectionMediaAccept[] };

export interface CollectionSettingOption {
    readonly value: string;
    readonly label: string;
    readonly icon?: string;
}

export type CollectionSettingControl =
    | { readonly kind: "text"; readonly placeholder?: string }
    | { readonly kind: "textarea"; readonly placeholder?: string; readonly rows?: number }
    | { readonly kind: "select" | "segmented"; readonly options: readonly CollectionSettingOption[] }
    | {
          readonly kind: "color";
          readonly tokens?: readonly CollectionSettingOption[];
          readonly allowCustom?: boolean;
      }
    | {
          readonly kind: "page-link";
          readonly allowPage?: boolean;
          readonly allowExternal?: boolean;
          readonly allowMedia?: boolean;
          readonly mediaAccept?: readonly CollectionMediaAccept[];
      }
    | { readonly kind: "endpoint-picker"; readonly methods?: readonly CollectionEndpointMethod[] }
    | { readonly kind: "toggle" };

export type CollectionEndpointMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

interface CollectionSettingBase {
    /** Safe HTML attribute name. */
    readonly id: string;
    readonly label: string;
    readonly group?: string;
    readonly help?: string;
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
              readonly minLength?: number;
              readonly maxLength: number;
              readonly control: Exclude<CollectionSettingControl, { readonly kind: "toggle" }>;
          }
        | {
              readonly type: "boolean";
              readonly default: boolean;
              readonly control: Extract<CollectionSettingControl, { readonly kind: "toggle" }>;
          }
    );

export type CollectionComponentSettings = readonly CollectionSettingItem[];

interface CollectionBlocBase {
    /** A stable custom-element tag prefixed by the collection ID. */
    readonly id: string;
    readonly label: string;
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
    readonly runtime?: { readonly viewJS: string };
}

export interface CollectionComposition extends CollectionBlocBase {
    readonly kind: "composition";
    /** Expanded into light DOM: the authoring host does not survive delivery. */
    readonly lightdom: string;
}

export type CollectionBloc = CollectionComponent | CollectionComposition;
