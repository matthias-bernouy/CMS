import type { CollectionCapabilityRequirement, CollectionTranslationKey } from "./CollectionRelease";
import type { CmsBrowserRuntimeAbi } from "@bernouy/cms-content/runtime-abi";
import type {
    BlocSettingControl,
    BlocSettingItem,
    BlocSettingOption,
    BlocSettings,
    BlocSettingVisibilityRule,
    BlocSettingVisibilityValue,
    BlocBrowserCapabilities,
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
    /** Hidden Blocs remain usable by Pages and other Blocs but are omitted from authoring catalogues. */
    readonly catalogue?: "listed" | "hidden";
    readonly thumbnail?: string;
    readonly uses: readonly string[];
    readonly requires: readonly CollectionCapabilityRequirement[];
    readonly slots: Readonly<Record<string, CollectionSlot>>;
    /** Native element contract for the authored element carrying `cms-bloc`. */
    readonly root: CollectionManagedNativeElement;
    /** Fixed authored markup expanded according to `kind`. */
    readonly markup: string;
    /** Editable initial page content, distinct from the fixed composition. */
    readonly defaultContent?: string;
    /** Exact browser authority exercised by authored iframe elements. */
    readonly browser?: BlocBrowserCapabilities;
}

export interface CollectionComponent extends CollectionBlocBase {
    readonly kind: "component";
    readonly style?: string;
    readonly settings?: CollectionComponentSettings;
    /** Immutable browser artifacts derived and verified when the release is admitted. */
    readonly runtime?: {
        /** Browser runtime contract required by `viewJS`; omitted for style-only artifacts. */
        readonly browserAbi?: CmsBrowserRuntimeAbi;
        readonly styleCSS?: string;
        readonly viewJS?: string;
    };
}

export interface CollectionComposition extends CollectionBlocBase {
    readonly kind: "composition";
}

export type CollectionBloc = CollectionComponent | CollectionComposition;
