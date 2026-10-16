import type { CollectionCapabilityRequirement, CollectionTranslationKey } from "./CollectionRelease";
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
    PageNativeContentProfile,
    PageSlot,
    PageSlotAccept,
} from "@bernouy/cms-content/page-document";

export type CollectionSlot = PageSlot;
export type CollectionSlotAccept = PageSlotAccept;
export type CollectionNativeContentProfile = PageNativeContentProfile;
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
    /** A stable namespaced Bloc identifier prefixed by the collection ID. */
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
    /** Native element contract for the authored element carrying `cms-bloc`. */
    readonly root: CollectionManagedNativeElement;
    /** Optional single Page-owned native child managed by a wrapper Bloc. */
    readonly content?: CollectionManagedNativeElement;
    /** Editable initial page content, distinct from the fixed composition. */
    readonly defaultContent?: string;
}

export interface CollectionComponent extends CollectionBlocBase {
    readonly kind: "component";
    /** Server-expanded Light DOM template. */
    readonly template: string;
    readonly style?: string;
    readonly settings?: CollectionComponentSettings;
    /** Immutable browser artifacts derived and verified when the release is admitted. */
    readonly runtime?: {
        readonly styleCSS?: string;
        readonly viewJS?: string;
    };
}

export interface CollectionComposition extends CollectionBlocBase {
    readonly kind: "composition";
    /** Expanded into light DOM: the authoring host does not survive delivery. */
    readonly lightdom: string;
}

export type CollectionBloc = CollectionComponent | CollectionComposition;
