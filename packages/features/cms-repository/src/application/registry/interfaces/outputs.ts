import type { publicationYankOutputSchema } from "cms-repository/application/registry/schemas/publications/state";
import type { z } from "zod";
import type { catalogueListOutputSchema } from "cms-repository/application/registry/schemas/catalogue/listing";
import type { namespaceClaimOutputSchema } from "cms-repository/application/registry/schemas/namespaces";
import type { publicationBeginOutputSchema } from "cms-repository/application/registry/schemas/publications/uploads";
import type { catalogueSearchOutputSchema } from "cms-repository/application/registry/schemas/search";
import type { artifactSourceGetOutputSchema } from "cms-repository/application/registry/schemas/sources";
import type { catalogueMetadataSchema } from "cms-repository/application/registry/schemas/catalogue/metadata";
export type NamespaceClaimOutput = z.output<typeof namespaceClaimOutputSchema>;
export type PublicationBeginOutput = z.output<typeof publicationBeginOutputSchema>;
export type CatalogueListOutput = z.output<typeof catalogueListOutputSchema>;
export type CatalogueSearchOutput = z.output<typeof catalogueSearchOutputSchema>;
export type SourceGetOutput = z.output<typeof artifactSourceGetOutputSchema>;
export type RepositoryCatalogueMetadata = z.output<typeof catalogueMetadataSchema>;

export type PublicationStateOutput = z.output<typeof publicationYankOutputSchema>;
