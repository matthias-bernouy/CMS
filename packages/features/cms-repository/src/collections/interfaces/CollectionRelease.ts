import type { UlviaObjectSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionText } from "./CollectionText";
import type { CollectionTheme } from "./CollectionTheme";
import type { CollectionBloc } from "./CollectionBloc";
import type { CollectionAssetDefinition } from "./CollectionAssets";
import type { CollectionView } from "./CollectionView";
import type { CollectionDashboard } from "./CollectionDashboard";

export interface CollectionConfiguration {
    readonly generation?: number;
    readonly schema: UlviaObjectSchema;
    readonly defaults: Readonly<Record<string, unknown>>;
}

export type CollectionMigrationOperation =
    | { readonly kind: "rename-bloc"; readonly from: string; readonly to: string }
    | { readonly kind: "rename-setting"; readonly bloc: string; readonly from: string; readonly to: string }
    | { readonly kind: "set-setting-default"; readonly bloc: string; readonly setting: string; readonly value: string }
    | { readonly kind: "remove-setting"; readonly bloc: string; readonly setting: string }
    | {
          readonly kind: "map-setting-value";
          readonly bloc: string;
          readonly setting: string;
          readonly values: Readonly<Record<string, string>>;
      }
    | { readonly kind: "rename-theme-token"; readonly from: string; readonly to: string }
    | { readonly kind: "move-configuration-value"; readonly from: readonly string[]; readonly to: readonly string[] }
    | { readonly kind: "set-configuration-default"; readonly path: readonly string[]; readonly value: unknown }
    | { readonly kind: "remove-configuration-value"; readonly path: readonly string[] }
    | {
          readonly kind: "map-configuration-value";
          readonly path: readonly string[];
          readonly values: readonly { readonly from: unknown; readonly to: unknown }[];
      }
    /** Renames both site overrides and persisted CMS text expressions. */
    | { readonly kind: "rename-text"; readonly from: string; readonly to: string }
    | { readonly kind: "remove-text-override"; readonly id: string };

/** One cumulative, deterministic transition. Releases carry every step needed from supported generations. */
export interface CollectionDataMigration {
    readonly fromGeneration: number;
    readonly toGeneration: number;
    readonly operations: readonly CollectionMigrationOperation[];
}

export type CollectionResourceKind = "bloc" | "theme-token" | "configuration" | "text" | "view" | "dashboard";

export interface CollectionResourceDescriptor {
    readonly kind: CollectionResourceKind;
    readonly id: string;
    readonly generation: number;
    readonly contractDigest: `sha256:${string}`;
    readonly implementationDigest: `sha256:${string}`;
}

/** A provider-neutral dependency of one reusable resource, not of the entire site. */
export interface CollectionCapabilityRequirement {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly versionRange: string;
}

/** Stable collection resources intentionally exposed to other collections. */
export interface CollectionResourceSelection {
    readonly blocs: readonly string[];
    /** Collection-local token IDs; their runtime namespace is derived from the owner. */
    readonly themeTokens: readonly string[];
}

/** A selective dependency on another collection's public resource surface. */
export interface CollectionDependency {
    readonly collectionId: string;
    readonly publisherId: string;
    readonly versionRange: string;
    readonly imports: CollectionResourceSelection;
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
    /** Persisted collection-data format. Increment only when site-owned data needs a migration. */
    readonly dataGeneration: number;
    /** Adjacent transitions retained cumulatively so an old site can reach this release. */
    readonly migrations: readonly CollectionDataMigration[];
    /** Collection translation key. */
    readonly name: CollectionTranslationKey;
    /** Collection translation key. */
    readonly description?: CollectionTranslationKey;
    readonly locale: string;
    readonly translations: CollectionTranslations;
    readonly exports?: CollectionResourceSelection;
    readonly dependencies?: readonly CollectionDependency[];
    readonly configuration?: CollectionConfiguration;
    readonly texts?: readonly CollectionText[];
    readonly theme?: CollectionTheme;
    readonly assets: readonly CollectionAssetDefinition[];
    readonly blocs: readonly CollectionBloc[];
    readonly views?: readonly CollectionView[];
    readonly dashboards?: readonly CollectionDashboard[];
}
