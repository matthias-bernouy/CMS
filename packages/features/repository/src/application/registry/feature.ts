import { collectionCatalogue } from "repository/application/registry/capabilities/catalogue/collection-catalogue";
import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapRepositoryError } from "repository/application/registry/capabilities/mapError";
import { namespaceClaim } from "repository/application/registry/capabilities/namespaces/namespace-claim";
import { namespaceSuspend } from "repository/application/registry/capabilities/namespaces/namespace-suspend";
import { namespaceTransfer } from "repository/application/registry/capabilities/namespaces/namespace-transfer";
import { artifactSourcePut } from "repository/application/registry/capabilities/sources/artifact-source-put";
import { publicationAbort } from "repository/application/registry/capabilities/publications/publication-abort";
import { publicationAsset } from "repository/application/registry/capabilities/publications/publication-asset";
import { publicationBegin } from "repository/application/registry/capabilities/publications/publication-begin";
import { publicationCommit } from "repository/application/registry/capabilities/publications/publication-commit";
import { publicationYank } from "repository/application/registry/capabilities/publications/publication-yank";
import { sourcePut } from "repository/application/registry/capabilities/sources/source-put";
import { artifactSourceGet } from "repository/application/registry/capabilities/sources/artifact-source-get";
import { assetDownload } from "repository/application/registry/capabilities/downloads/asset-download";
import { catalogueList } from "repository/application/registry/capabilities/catalogue/catalogue-list";
import { catalogueSearch } from "repository/application/registry/capabilities/catalogue/catalogue-search";
import { namespaceGet } from "repository/application/registry/capabilities/namespaces/namespace-get";
import { namespaceList } from "repository/application/registry/capabilities/namespaces/namespace-list";
import { publicationCheckCollection } from "repository/application/registry/capabilities/publications/publication-check-collection";
import { publicationState } from "repository/application/registry/capabilities/publications/publication-state";
import { publicationStatus } from "repository/application/registry/capabilities/publications/publication-status";
import { releaseDownload } from "repository/application/registry/capabilities/downloads/release-download";
import { repositoryInfo } from "repository/application/registry/capabilities/catalogue/repository-info";
import { sourceGet } from "repository/application/registry/capabilities/sources/source-get";
export const repositoryFeature = defineFeature({
    contractId: "ulvia/repository",
    name: "Ulvia Repository",
    description: "Public discovery and account-owned namespaces for immutable contracts, providers and collections.",
    version: "1.1.0",
    publisherId: "ulvia",
    documents: new URL("../../../docs/repository/", import.meta.url),
    mapError: mapRepositoryError,
    capabilities: [
        collectionCatalogue,
        namespaceClaim,
        namespaceSuspend,
        namespaceTransfer,
        artifactSourcePut,
        publicationAbort,
        publicationAsset,
        publicationBegin,
        publicationCommit,
        publicationYank,
        sourcePut,
        artifactSourceGet,
        assetDownload,
        catalogueList,
        catalogueSearch,
        namespaceGet,
        namespaceList,
        publicationCheckCollection,
        publicationState,
        publicationStatus,
        releaseDownload,
        repositoryInfo,
        sourceGet,
    ],
});
export type {
    RepositoryServices,
    RepositoryService,
    RepositoryActor,
} from "repository/application/registry/interfaces/services";
