import type { UlviaObjectSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionText } from "./CollectionText";
import type { CollectionBloc } from "./CollectionBloc";
import type { CollectionAssetDefinition } from "./CollectionAssets";

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

/** Authored release data; admission does not compile rendering or grant execution authority. */
export interface CollectionRelease {
    readonly kind: "collection";
    readonly protocol: "ulvia-collection/v1";
    readonly schemaDialect: "ulvia-schema/v1";
    readonly collectionId: string;
    readonly publisherId: string;
    readonly version: string;
    readonly name: string;
    readonly description?: string;
    readonly locale: string;
    readonly configuration?: CollectionConfiguration;
    readonly texts?: readonly CollectionText[];
    readonly assets: readonly CollectionAssetDefinition[];
    readonly blocs: readonly CollectionBloc[];
}
