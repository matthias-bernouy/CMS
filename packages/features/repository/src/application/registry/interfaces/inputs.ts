import type { collectionCatalogueInputSchema } from "repository/application/registry/schemas/catalogue/collection-catalogue";
import type { z } from "zod";
import type { catalogueListInputSchema } from "repository/application/registry/schemas/catalogue/listing";
import type { assetDownloadInputSchema } from "repository/application/registry/schemas/downloads";
import type {
    namespaceClaimInputSchema,
    namespaceSuspendInputSchema,
    namespaceTransferInputSchema,
} from "repository/application/registry/schemas/namespaces";
import type {
    publicationCheckCollectionInputSchema,
    publicationStateInputSchema,
    publicationYankInputSchema,
} from "repository/application/registry/schemas/publications/state";
import type {
    publicationAbortInputSchema,
    publicationAssetInputSchema,
    publicationBeginInputSchema,
} from "repository/application/registry/schemas/publications/uploads";
import type { catalogueSearchInputSchema } from "repository/application/registry/schemas/search";
import type {
    artifactSourceGetInputSchema,
    artifactSourcePutInputSchema,
    sourceGetInputSchema,
    sourcePutInputSchema,
} from "repository/application/registry/schemas/sources";
export type NamespaceClaimInput = z.output<typeof namespaceClaimInputSchema>;
export type NamespaceSuspendInput = z.output<typeof namespaceSuspendInputSchema>;
export type NamespaceTransferInput = z.output<typeof namespaceTransferInputSchema>;
export type ArtifactSourcePutInput = z.output<typeof artifactSourcePutInputSchema>;
export type PublicationAssetInput = Omit<z.output<typeof publicationAssetInputSchema>, "bytes">;
export type PublicationBeginInput = Omit<z.output<typeof publicationBeginInputSchema>, "manifest">;
export type PublicationYankInput = z.output<typeof publicationYankInputSchema>;
export type SourcePutInput = z.output<typeof sourcePutInputSchema>;
export type ArtifactSourceGetInput = z.output<typeof artifactSourceGetInputSchema>;
export type AssetDownloadInput = z.output<typeof assetDownloadInputSchema>;
export type CatalogueListInput = z.output<typeof catalogueListInputSchema>;
export type CatalogueSearchInput = z.output<typeof catalogueSearchInputSchema>;
export type NamespaceGetInput = z.output<typeof namespaceClaimInputSchema>;
export type PublicationCheckCollectionInput = z.output<typeof publicationCheckCollectionInputSchema>;
export type PublicationStateInput = z.output<typeof publicationStateInputSchema>;
export type PublicationStatusInput = z.output<typeof publicationAbortInputSchema>;
export type ReleaseDownloadInput = z.output<typeof publicationStateInputSchema>;
export type SourceGetInput = z.output<typeof sourceGetInputSchema>;

export type CollectionCatalogueInput = z.output<typeof collectionCatalogueInputSchema>;
