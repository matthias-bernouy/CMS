import type { UlviaObjectSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionText } from "./CollectionText";
import type { CollectionTheme } from "./CollectionTheme";
import type { CollectionBloc } from "./CollectionBloc";
import type { CollectionAssetDefinition } from "./CollectionAssets";
import type { CollectionPage, CollectionExample } from "./CollectionPage";
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

export type CollectionResourceKind = "bloc" | "theme-token" | "configuration" | "text" | "asset" | "page" | "state";

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
    readonly pages?: readonly string[];
    readonly states?: readonly string[];
}

export interface CollectionResourceImport {
    readonly id: string;
}

interface CollectionPageImport extends CollectionResourceImport {
    /** Authored route used by native links and verified against the selected dependency release. */
    readonly defaultPath: string;
}

export interface CollectionResourceImportSelection {
    readonly blocs: readonly CollectionResourceImport[];
    readonly themeTokens: readonly CollectionResourceImport[];
    readonly texts?: readonly CollectionResourceImport[];
    readonly assets?: readonly CollectionResourceImport[];
    readonly pages?: readonly CollectionPageImport[];
    readonly states?: readonly CollectionResourceImport[];
}

/** A selective dependency on another collection's public resource surface. */
export interface CollectionDependency {
    readonly collectionId: string;
    readonly publisherId: string;
    readonly versionRange: string;
    readonly imports: CollectionResourceImportSelection;
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
    readonly pages?: readonly CollectionPage[];
    readonly examples?: readonly CollectionExample[];
}
