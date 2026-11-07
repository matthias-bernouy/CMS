import type { UlviaObjectSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionText } from "./CollectionText";
import type { CollectionTheme } from "./CollectionTheme";
import type { CollectionBloc } from "./CollectionBloc";
import type { CollectionAssetDefinition } from "./CollectionAssets";
import type { CollectionExample } from "./CollectionExample";
import type { CollectionState } from "./CollectionState";

/** Advisory lifecycle metadata. Dates never disable a resource implicitly. */
export interface CollectionResourceDeprecation {
    readonly reason: CollectionTranslationKey;
    readonly replacedBy?: string;
    readonly sunsetAt?: string;
}

export interface CollectionConfiguration {
    readonly deprecation?: CollectionResourceDeprecation;
    readonly schema: UlviaObjectSchema;
    readonly defaults: Readonly<Record<string, unknown>>;
}

export type CollectionResourceKind = "bloc" | "theme-token" | "configuration" | "text" | "asset" | "state";

export interface CollectionResourceDescriptor {
    readonly kind: CollectionResourceKind;
    readonly id: string;
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
    /** Collection-local server text IDs. References remain qualified by their owner collection. */
    readonly texts?: readonly string[];
    /** Collection-local immutable asset IDs. References remain qualified by their owner collection. */
    readonly assets?: readonly string[];
    readonly states?: readonly string[];
}

export interface CollectionResourceImport {
    readonly id: string;
}

export interface CollectionResourceImportSelection {
    readonly blocs: readonly CollectionResourceImport[];
    readonly themeTokens: readonly CollectionResourceImport[];
    readonly texts?: readonly CollectionResourceImport[];
    readonly assets?: readonly CollectionResourceImport[];
    readonly states?: readonly CollectionResourceImport[];
}

/** A selective dependency on another collection's public resource surface. */
export interface CollectionDependency {
    readonly collectionId: string;
    readonly publisherId: string;
    readonly versionRange: string;
    readonly imports: CollectionResourceImportSelection;
}

/** Exact installation-only recipe dependency; never a network location or live resource import. */
export interface CollectionBootstrapReference {
    readonly publisherId: string;
    readonly collectionId: string;
    readonly version: string;
    readonly digest: `sha256:${string}`;
    readonly bootstrapId: string;
    readonly omitPages?: readonly string[];
}

/** Proposed ordinary Page copied from a local example only when explicitly initialized. */
export interface CollectionBootstrapPage {
    readonly id: string;
    readonly exampleId: string;
    readonly path: string;
    readonly title: CollectionTranslationKey;
    readonly description: CollectionTranslationKey;
    readonly indexing: boolean;
    readonly visible: boolean;
    readonly systemRole?: "login";
}

/** Immutable installation data; installing or upgrading a collection never executes it. */
export interface CollectionBootstrap {
    readonly id: string;
    readonly label: CollectionTranslationKey;
    readonly description: CollectionTranslationKey;
    readonly requires: readonly CollectionCapabilityRequirement[];
    readonly includes: readonly CollectionBootstrapReference[];
    readonly pages: readonly CollectionBootstrapPage[];
}

/** Stable collection-local key resolved through the immutable translations catalogue. */
export type CollectionTranslationKey = string;

/** Immutable administration copy: canonical locale -> translation key -> static value. */
export type CollectionTranslations = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Immutable release data; admission derives verified rendering fragments but grants no execution authority. */
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
    readonly exports?: CollectionResourceSelection;
    readonly dependencies?: readonly CollectionDependency[];
    readonly configuration?: CollectionConfiguration;
    readonly texts?: readonly CollectionText[];
    readonly theme?: CollectionTheme;
    readonly assets: readonly CollectionAssetDefinition[];
    readonly states?: readonly CollectionState[];
    readonly blocs: readonly CollectionBloc[];
    readonly examples?: readonly CollectionExample[];
    readonly bootstraps?: readonly CollectionBootstrap[];
}
