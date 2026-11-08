import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapRepositoryError } from "cms-repository/application/registry/capabilities/mapError";
import { namespaceClaim } from "cms-repository/application/registry/capabilities/namespaces/namespace-claim";
import { namespaceSuspend } from "cms-repository/application/registry/capabilities/namespaces/namespace-suspend";
import { namespaceTransfer } from "cms-repository/application/registry/capabilities/namespaces/namespace-transfer";
import { artifactSourcePut } from "cms-repository/application/registry/capabilities/sources/artifact-source-put";
import { publicationAbort } from "cms-repository/application/registry/capabilities/publications/publication-abort";
import { publicationAsset } from "cms-repository/application/registry/capabilities/publications/publication-asset";
import { publicationBegin } from "cms-repository/application/registry/capabilities/publications/publication-begin";
import { publicationCommit } from "cms-repository/application/registry/capabilities/publications/publication-commit";
import { publicationYank } from "cms-repository/application/registry/capabilities/publications/publication-yank";
import { sourcePut } from "cms-repository/application/registry/capabilities/sources/source-put";
import { artifactSourceGet } from "cms-repository/application/registry/capabilities/sources/artifact-source-get";
import { assetDownload } from "cms-repository/application/registry/capabilities/downloads/asset-download";
import { catalogueList } from "cms-repository/application/registry/capabilities/catalogue/catalogue-list";
import { catalogueSearch } from "cms-repository/application/registry/capabilities/catalogue/catalogue-search";
import { namespaceGet } from "cms-repository/application/registry/capabilities/namespaces/namespace-get";
import { namespaceList } from "cms-repository/application/registry/capabilities/namespaces/namespace-list";
import { publicationCheckCollection } from "cms-repository/application/registry/capabilities/publications/publication-check-collection";
import { publicationState } from "cms-repository/application/registry/capabilities/publications/publication-state";
import { publicationStatus } from "cms-repository/application/registry/capabilities/publications/publication-status";
import { releaseDownload } from "cms-repository/application/registry/capabilities/downloads/release-download";
import { repositoryInfo } from "cms-repository/application/registry/capabilities/catalogue/repository-info";
import { sourceGet } from "cms-repository/application/registry/capabilities/sources/source-get";
export const repositoryFeature = defineFeature({
    contractId: "ulvia/repository",
    name: "Ulvia Repository",
    description: "Public discovery and account-owned namespaces for immutable contracts, providers and collections.",
    version: "1.0.0",
    publisherId: "ulvia",
    documents: new URL("../../../docs/repository/", import.meta.url),
    mapError: mapRepositoryError,
    capabilities: [
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
} from "cms-repository/application/registry/interfaces/services";
