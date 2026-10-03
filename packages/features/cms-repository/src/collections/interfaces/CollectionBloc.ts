import type { CollectionCapabilityRequirement, CollectionTranslationKey } from "./CollectionRelease";
import type { CollectionThemeTokenType } from "./CollectionTheme";

export interface CollectionSlot {
    readonly accepts?: readonly CollectionSlotAccept[];
    readonly min?: number;
    readonly max?: number;
}

export type CollectionMediaAccept = "image" | "bitmap" | "svg" | "video" | "audio" | "document";

export type CollectionSlotAccept =
    | { readonly kind: "component"; readonly tag: string }
    | { readonly kind: "any-component" }
    | { readonly kind: "media"; readonly accept?: readonly CollectionMediaAccept[] }
    | { readonly kind: "plain-text" }
    | { readonly kind: "rich-text"; readonly profile: CollectionRichTextProfile };

export type CollectionRichTextProfile = "inline" | "prose";

export type CollectionManagedNativeElementTag =
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6"
    | "p"
    | "a"
    | "button"
    | "input"
    | "textarea"
    | "select"
    | "output"
    | "img"
    | "svg"
    | "span";

export interface CollectionManagedNativeAttributeConstraint {
    /** Whether the authored child must explicitly carry this attribute. */
    readonly required?: boolean;
    /** Optional finite set accepted when the attribute is present. */
    readonly values?: readonly string[];
}

export interface CollectionManagedNativeElement {
    /** Native tags an author may select for the single page-owned child. */
    readonly accepts: readonly CollectionManagedNativeElementTag[];
    /** Structural attributes that keep specialized controls semantically honest. */
    readonly attributes?: Readonly<Record<string, CollectionManagedNativeAttributeConstraint>>;
}

export interface CollectionSettingOption {
    readonly value: string;
    readonly label: CollectionTranslationKey;
    readonly icon?: string;
}

export type CollectionSettingControl =
    | { readonly kind: "text"; readonly placeholder?: CollectionTranslationKey }
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
    | { readonly kind: "media-picker"; readonly accept?: readonly CollectionMediaAccept[] }
    | { readonly kind: "theme-token-picker"; readonly accept?: readonly CollectionThemeTokenType[] }
    | { readonly kind: "number" | "range"; readonly step?: number; readonly suffix?: CollectionTranslationKey }
    | { readonly kind: "toggle" };

/** Collection settings always target attributes on the custom-element wrapper. */
interface CollectionSettingBase {
    /** Safe HTML attribute name. */
    readonly id: string;
    readonly label: CollectionTranslationKey;
    readonly group?: CollectionTranslationKey;
    readonly help?: CollectionTranslationKey;
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
              /** Optional authoring override; admission always normalizes a safe bound. */
              readonly maxLength?: number;
              readonly control: Exclude<CollectionSettingControl, { readonly kind: "toggle" | "number" | "range" }>;
          }
        | {
              readonly type: "boolean";
              readonly default: boolean;
              readonly control: Extract<CollectionSettingControl, { readonly kind: "toggle" }>;
          }
        | {
              readonly type: "number" | "integer";
              readonly default: number;
              readonly minimum?: number;
              readonly maximum?: number;
              readonly control: Extract<CollectionSettingControl, { readonly kind: "number" | "range" }>;
          }
    );

export type CollectionComponentSettings = readonly CollectionSettingItem[];

interface CollectionBlocBase {
    /** A stable custom-element tag prefixed by the collection ID. */
    readonly id: string;
    /** Independent public-contract generation for selective consumers. */
    readonly generation?: number;
    readonly label: CollectionTranslationKey;
    readonly description?: CollectionTranslationKey;
    /** Author-facing library category translation key. */
    readonly category?: CollectionTranslationKey;
    /** Stable ascending position inside the category. */
    readonly order?: number;
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
    /** Contract for the single page-owned native Light DOM child. */
    readonly nativeElement?: CollectionManagedNativeElement;
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
