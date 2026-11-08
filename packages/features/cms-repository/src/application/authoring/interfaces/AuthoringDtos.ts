import type { z } from "zod";
import type { connectionStatusSchema } from "cms-repository/application/authoring/schemas/connection";
import type {
    namespaceInventoryInputSchema,
    namespaceInventorySchema,
} from "cms-repository/application/authoring/schemas/namespaces";
import type {
    publishContractOutputSchema,
    publishProviderManifestOutputSchema,
    publishCollectionOutputSchema,
} from "cms-repository/application/authoring/schemas/publication";
export type RepositoryConnectionStatus = z.output<typeof connectionStatusSchema>;
export type NamespaceInventoryQuery = z.input<typeof namespaceInventoryInputSchema>;
export type NamespaceInventoryPage = z.output<typeof namespaceInventorySchema>;
export type NamespaceAccess = NamespaceInventoryPage["items"][number];
export type ContractPublication = z.output<typeof publishContractOutputSchema>;
export type ProviderManifestPublication = z.output<typeof publishProviderManifestOutputSchema>;
export type CollectionPublication = z.output<typeof publishCollectionOutputSchema>;
export type ArtifactPublication = ContractPublication | ProviderManifestPublication;
