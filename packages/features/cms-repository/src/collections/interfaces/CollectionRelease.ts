import type { UlviaObjectSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionText } from "./CollectionText";
import type { CollectionTheme } from "./CollectionTheme";
import type { CollectionBloc } from "./CollectionBloc";
import type { CollectionAssetDefinition } from "./CollectionAssets";
import type { CollectionView } from "./CollectionView";
import type { CollectionDashboard } from "./CollectionDashboard";

export interface CollectionConfiguration {
    readonly schema: UlviaObjectSchema;
    readonly defaults: Readonly<Record<string, unknown>>;
}

/** A provider-neutral dependency of one reusable resource, not of the entire site. */
export interface CollectionCapabilityRequirement {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly versionRange: string;
}

/** Stable collection-local key resolved through the immutable translations catalogue. */
export type CollectionTranslationKey = string;

/** Immutable administration copy: canonical locale -> translation key -> static value. */
export type CollectionTranslations = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Authored release data; admission does not compile rendering or grant execution authority. */
export interface CollectionRelease {
    readonly kind: "collection";
    readonly protocol: "ulvia-collection/v1";
    readonly schemaDialect: "ulvia-schema/v1";
    readonly collectionId: string;
    readonly publisherId: string;
    readonly version: string;
    /** Collection translation key. */
    readonly name: CollectionTranslationKey;
    /** Collection translation key. */
    readonly description?: CollectionTranslationKey;
    readonly locale: string;
    readonly translations: CollectionTranslations;
    readonly configuration?: CollectionConfiguration;
    readonly texts?: readonly CollectionText[];
    readonly theme?: CollectionTheme;
    readonly assets: readonly CollectionAssetDefinition[];
    readonly blocs: readonly CollectionBloc[];
    readonly views?: readonly CollectionView[];
    readonly dashboards?: readonly CollectionDashboard[];
}
