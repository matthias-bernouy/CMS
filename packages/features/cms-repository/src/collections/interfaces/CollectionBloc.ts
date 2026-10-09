import type { CollectionCapabilityRequirement, CollectionTranslationKey } from "./CollectionRelease";
import type { CollectionPageSurface } from "./CollectionPage";
import type {
    BlocSettingControl,
    BlocSettingItem,
    BlocSettingOption,
    BlocSettings,
    BlocSettingVisibilityRule,
    BlocSettingVisibilityValue,
    ManagedNativeAttributeConstraint,
    ManagedNativeElement,
    ManagedNativeElementTag,
    MediaAccept,
    PageRichTextProfile,
    PageSlot,
    PageSlotAccept,
} from "@bernouy/cms-content/page-document";

export type CollectionSlot = PageSlot;
export type CollectionSlotAccept = PageSlotAccept;
export type CollectionRichTextProfile = PageRichTextProfile;
export type CollectionMediaAccept = MediaAccept;
export type CollectionManagedNativeElementTag = ManagedNativeElementTag;
export type CollectionManagedNativeAttributeConstraint = ManagedNativeAttributeConstraint;
export type CollectionManagedNativeElement = ManagedNativeElement;
export type CollectionSettingOption = BlocSettingOption;
export type CollectionSettingControl = BlocSettingControl;
export type CollectionSettingVisibilityValue = BlocSettingVisibilityValue;
export type CollectionSettingVisibilityRule = BlocSettingVisibilityRule;
export type CollectionSettingItem = BlocSettingItem;
export type CollectionComponentSettings = BlocSettings;

interface CollectionBlocBase {
    /** A stable custom-element tag prefixed by the collection ID. */
    readonly id: string;
    /** Independent public-contract generation for selective consumers. */
    readonly generation?: number;
    readonly label: CollectionTranslationKey;
    /** Omission in authored sources is normalized to both surfaces. */
    readonly surfaces: readonly CollectionPageSurface[];
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
