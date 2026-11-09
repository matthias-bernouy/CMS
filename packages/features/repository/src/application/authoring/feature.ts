import { getSourceSnapshot } from "./capabilities/sources/get-source-snapshot";
import { publishCollectionOperation } from "./capabilities/publication/publish-collection-operation";
import { getPublicationOperation } from "./capabilities/publication/get-publication-operation";
import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapAuthoringError } from "repository/application/authoring/capabilities/mapError";
import { prepareContract } from "repository/application/authoring/capabilities/preparations/prepare-contract";
import { prepareProviderManifest } from "repository/application/authoring/capabilities/preparations/prepare-provider-manifest";
import { publishContract } from "repository/application/authoring/capabilities/publication/publish-contract";
import { publishProviderManifest } from "repository/application/authoring/capabilities/publication/publish-provider-manifest";
import { claimNamespace } from "repository/application/authoring/capabilities/namespaces/claim-namespace";
import { configureConnection } from "repository/application/authoring/capabilities/connection/configure-connection";
import { discardPreparation } from "repository/application/authoring/capabilities/preparations/discard-preparation";
import { disconnectConnection } from "repository/application/authoring/capabilities/connection/disconnect-connection";
import { prepareCollection } from "repository/application/authoring/capabilities/preparations/prepare-collection";
import { publishCollection } from "repository/application/authoring/capabilities/publication/publish-collection";
import { getContractSources } from "repository/application/authoring/capabilities/sources/get-contract-sources";
import { getProviderManifestSources } from "repository/application/authoring/capabilities/sources/get-provider-manifest-sources";
import { getCollectionSources } from "repository/application/authoring/capabilities/sources/get-collection-sources";
import { getConnection } from "repository/application/authoring/capabilities/connection/get-connection";
import { listNamespaces } from "repository/application/authoring/capabilities/namespaces/list-namespaces";
export const authoringFeature = defineFeature({
    contractId: "ulvia/cms.authoring",
    name: "CMS Authoring",
    description:
        "Prepare immutable collection, contract and Provider manifest sources and publish through a pinned Repository account connection.",
    version: "1.2.0",
    publisherId: "ulvia",
    catalogue: { icon: "package", categories: ["administration", "authoring"] },
    documents: new URL("../../../docs/authoring/", import.meta.url),
    mapError: mapAuthoringError,
    capabilities: [
        getSourceSnapshot,
        prepareContract,
        prepareProviderManifest,
        publishContract,
        publishProviderManifest,
        claimNamespace,
        configureConnection,
        discardPreparation,
        disconnectConnection,
        prepareCollection,
        publishCollection,
        publishCollectionOperation,
        getPublicationOperation,
        getContractSources,
        getProviderManifestSources,
        getCollectionSources,
        getConnection,
        listNamespaces,
    ],
});
export type {
    AuthoringServices,
    AuthoringService,
} from "repository/application/authoring/interfaces/AuthoringServices";

export type {
    ContractPublication,
    ProviderManifestPublication,
    CollectionPublication,
} from "repository/application/authoring/interfaces/AuthoringDtos";
