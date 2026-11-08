import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapAuthoringError } from "cms-repository/application/authoring/capabilities/mapError";
import { prepareContract } from "cms-repository/application/authoring/capabilities/preparations/prepare-contract";
import { prepareProviderManifest } from "cms-repository/application/authoring/capabilities/preparations/prepare-provider-manifest";
import { publishContract } from "cms-repository/application/authoring/capabilities/publication/publish-contract";
import { publishProviderManifest } from "cms-repository/application/authoring/capabilities/publication/publish-provider-manifest";
import { claimNamespace } from "cms-repository/application/authoring/capabilities/namespaces/claim-namespace";
import { configureConnection } from "cms-repository/application/authoring/capabilities/connection/configure-connection";
import { discardPreparation } from "cms-repository/application/authoring/capabilities/preparations/discard-preparation";
import { disconnectConnection } from "cms-repository/application/authoring/capabilities/connection/disconnect-connection";
import { prepareCollection } from "cms-repository/application/authoring/capabilities/preparations/prepare-collection";
import { publishCollection } from "cms-repository/application/authoring/capabilities/publication/publish-collection";
import { getContractSources } from "cms-repository/application/authoring/capabilities/sources/get-contract-sources";
import { getProviderManifestSources } from "cms-repository/application/authoring/capabilities/sources/get-provider-manifest-sources";
import { getCollectionSources } from "cms-repository/application/authoring/capabilities/sources/get-collection-sources";
import { getConnection } from "cms-repository/application/authoring/capabilities/connection/get-connection";
import { listNamespaces } from "cms-repository/application/authoring/capabilities/namespaces/list-namespaces";
export const authoringFeature = defineFeature({
    contractId: "ulvia/cms.authoring",
    name: "CMS Authoring",
    description:
        "Prepare immutable collection, contract and Provider manifest sources and publish through a pinned Repository account connection.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { icon: "package", categories: ["administration", "authoring"] },
    documents: new URL("../../../docs/authoring/", import.meta.url),
    mapError: mapAuthoringError,
    capabilities: [
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
} from "cms-repository/application/authoring/interfaces/AuthoringServices";

export type {
    ContractPublication,
    ProviderManifestPublication,
    CollectionPublication,
} from "cms-repository/application/authoring/interfaces/AuthoringDtos";
