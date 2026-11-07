import type { publicationYankOutputSchema } from "repository/application/registry/schemas/publications/state";
import type { z } from "zod";
import type { catalogueListOutputSchema } from "repository/application/registry/schemas/catalogue/listing";
import type { namespaceClaimOutputSchema } from "repository/application/registry/schemas/namespaces";
import type { publicationBeginOutputSchema } from "repository/application/registry/schemas/publications/uploads";
import type { catalogueSearchOutputSchema } from "repository/application/registry/schemas/search";
import type { artifactSourceGetOutputSchema } from "repository/application/registry/schemas/sources";
import type { catalogueMetadataSchema } from "repository/application/registry/schemas/catalogue/metadata";
export type NamespaceClaimOutput = z.output<typeof namespaceClaimOutputSchema>;
export type PublicationBeginOutput = z.output<typeof publicationBeginOutputSchema>;
export type CatalogueListOutput = z.output<typeof catalogueListOutputSchema>;
export type CatalogueSearchOutput = z.output<typeof catalogueSearchOutputSchema>;
export type SourceGetOutput = z.output<typeof artifactSourceGetOutputSchema>;
export type RepositoryCatalogueMetadata = z.output<typeof catalogueMetadataSchema>;

export type PublicationStateOutput = z.output<typeof publicationYankOutputSchema>;

export type CollectionCatalogueOutput = z.output<typeof catalogueListOutputSchema>;
