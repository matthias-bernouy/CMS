import { listInstalledCollections } from "./capabilities/collections/resources/list-installed-collections";
import { configureCollection } from "./capabilities/collections/resources/configure-collection";
import { installCollections } from "./capabilities/collections/resources/install-collections";
import { getCollectionDetails } from "./capabilities/collections/resources/get-collection-details";
import { listCollectionReleases } from "repository/application/installations/capabilities/collections/discovery/list-collection-releases";
import { listCollectionCatalogue } from "repository/application/installations/capabilities/collections/discovery/list-collection-catalogue";
import { getCollectionRelease } from "repository/application/installations/capabilities/collections/discovery/get-collection-release";
import { initializationApply } from "repository/application/installations/capabilities/initialization/apply";
import { initializationEntry } from "repository/application/installations/capabilities/initialization/entry";
import { initializationList } from "repository/application/installations/capabilities/initialization/list";
import { initializationPlan } from "repository/application/installations/capabilities/initialization/plan";
import { initializationStatus } from "repository/application/installations/capabilities/initialization/status";
import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapInstallationError } from "repository/application/installations/capabilities/policy/mapError";
import { gatewayAuditAppend } from "repository/application/installations/capabilities/gateway/routing/gateway.audit.append";
import { applyCollectionUpgrade } from "repository/application/installations/capabilities/upgrades/collections/apply-collection-upgrade";
import { applyContractUpgrade } from "repository/application/installations/capabilities/upgrades/contracts/apply-contract-upgrade";
import { approveProviderConnection } from "repository/application/installations/capabilities/providers/administration/approve-provider-connection";
import { gatewayDelegationClose } from "repository/application/installations/capabilities/gateway/delegation/gateway.delegation.close";
import { importProviderManifest } from "repository/application/installations/capabilities/providers/administration/import-provider-manifest";
import { installCollection } from "repository/application/installations/capabilities/collections/install-collection";
import { gatewayDelegationIssue } from "repository/application/installations/capabilities/gateway/delegation/gateway.delegation.issue";
import { gatewayInvocationIssue } from "repository/application/installations/capabilities/gateway/invocation/gateway.invocation.issue";
import { pairProviderConnection } from "repository/application/installations/capabilities/providers/administration/pair-provider-connection";
import { gatewayDispatchPrepare } from "repository/application/installations/capabilities/gateway/invocation/gateway.dispatch.prepare";
import { gatewayProviderPrepare } from "repository/application/installations/capabilities/gateway/invocation/gateway.provider.prepare";
import { previewProviderConnection } from "repository/application/installations/capabilities/providers/administration/preview-provider-connection";
import { gatewayIdentityResolve } from "repository/application/installations/capabilities/gateway/routing/gateway.identity.resolve";
import { gatewayProviderResolve } from "repository/application/installations/capabilities/gateway/authority/gateway.provider.resolve";
import { resumeCollectionUpgrade } from "repository/application/installations/capabilities/upgrades/collections/resume-collection-upgrade";
import { resumeContractUpgrade } from "repository/application/installations/capabilities/upgrades/contracts/resume-contract-upgrade";
import { setProviderStatus } from "repository/application/installations/capabilities/providers/reads/set-provider-status";
import { updateCollectionConfiguration } from "repository/application/installations/capabilities/collections/update-collection-configuration";
import { gatewayProviderAuthorize } from "repository/application/installations/capabilities/gateway/authority/gateway.provider.authorize";
import { gatewayDelegationCheck } from "repository/application/installations/capabilities/gateway/delegation/gateway.delegation.check";
import { capabilitiesDescribe } from "repository/application/installations/capabilities/discovery/capabilities.describe";
import { documentationGet } from "repository/application/installations/capabilities/discovery/documentation.get";
import { documentationSearch } from "repository/application/installations/capabilities/discovery/documentation.search";
import { getCollectionInstallation } from "repository/application/installations/capabilities/collections/get-collection-installation";
import { getCollectionUpgrade } from "repository/application/installations/capabilities/upgrades/collections/get-collection-upgrade";
import { getContractUpgrade } from "repository/application/installations/capabilities/upgrades/contracts/get-contract-upgrade";
import { gatewayRouteGet } from "repository/application/installations/capabilities/gateway/routing/gateway.route.get";
import { getOperation } from "repository/application/installations/capabilities/operations/get-operation";
import { getProviderAccess } from "repository/application/installations/capabilities/providers/administration/get-provider-access";
import { getProviderInstallation } from "repository/application/installations/capabilities/providers/reads/get-provider-installation";
import { getSiteUpgradeStatus } from "repository/application/installations/capabilities/upgrades/collections/get-site-upgrade-status";
import { listAvailableCollections } from "repository/application/installations/capabilities/collections/list-available-collections";
import { listAvailableProviders } from "repository/application/installations/capabilities/providers/administration/list-available-providers";
import { listCollectionInstallations } from "repository/application/installations/capabilities/collections/list-collection-installations";
import { listOperations } from "repository/application/installations/capabilities/operations/list-operations";
import { listProviderInstallations } from "repository/application/installations/capabilities/providers/reads/list-provider-installations";
import { listSiteUsage } from "repository/application/installations/capabilities/collections/list-site-usage";
import { planCollectionUpgrade } from "repository/application/installations/capabilities/upgrades/collections/plan-collection-upgrade";
import { planContractUpgrade } from "repository/application/installations/capabilities/upgrades/contracts/plan-contract-upgrade";
import { repositoryGet } from "repository/application/installations/capabilities/discovery/repository.get";
import { repositorySearch } from "repository/application/installations/capabilities/discovery/repository.search";
import { getRepositorySettings } from "repository/application/installations/capabilities/initialization/repository";
import { configureRepository } from "repository/application/installations/capabilities/initialization/configure-repository";
import { createRepository } from "repository/application/installations/capabilities/initialization/create-repository";
export const installationsFeature = defineFeature({
    contractId: "ulvia/cms.installations",
    name: "CMS Installations",
    description:
        "Inspect and administer the collection installations, provider installations and contract selections of one CMS instance.",
    version: "1.4.0",
    publisherId: "ulvia",
    catalogue: { icon: "installations", categories: ["administration", "content", "infrastructure"] },
    documents: new URL("../../../docs/installations/", import.meta.url),
    mapError: mapInstallationError,
    capabilities: [
        listInstalledCollections,
        configureCollection,
        installCollections,
        getCollectionDetails,
        listCollectionReleases,
        listCollectionCatalogue,
        getCollectionRelease,
        initializationApply,
        initializationEntry,
        initializationList,
        initializationPlan,
        initializationStatus,
        getRepositorySettings,
        configureRepository,
        createRepository,

        gatewayAuditAppend,
        applyCollectionUpgrade,
        applyContractUpgrade,
        approveProviderConnection,
        gatewayDelegationClose,
        importProviderManifest,
        installCollection,
        gatewayDelegationIssue,
        gatewayInvocationIssue,
        pairProviderConnection,
        gatewayDispatchPrepare,
        gatewayProviderPrepare,
        previewProviderConnection,
        gatewayIdentityResolve,
        gatewayProviderResolve,
        resumeCollectionUpgrade,
        resumeContractUpgrade,
        setProviderStatus,
        updateCollectionConfiguration,
        gatewayProviderAuthorize,
        gatewayDelegationCheck,
        capabilitiesDescribe,
        documentationGet,
        documentationSearch,
        getCollectionInstallation,
        getCollectionUpgrade,
        getContractUpgrade,
        gatewayRouteGet,
        getOperation,
        getProviderAccess,
        getProviderInstallation,
        getSiteUpgradeStatus,
        listAvailableCollections,
        listAvailableProviders,
        listCollectionInstallations,
        listOperations,
        listProviderInstallations,
        listSiteUsage,
        planCollectionUpgrade,
        planContractUpgrade,
        repositoryGet,
        repositorySearch,
    ],
});
export type {
    InstallationServices,
    CollectionSourceReader,
} from "repository/application/installations/interfaces/services";
export type { InstallationGateway } from "repository/application/installations/interfaces/gateway";
export type {
    InstallationManagement,
    ProviderAdministration,
} from "repository/application/installations/interfaces/management";
export type { InstallationOperationQueries } from "repository/application/installations/interfaces/operations";
export type * from "repository/application/installations/interfaces/outputs";

export { InstallationError } from "repository/application/installations/core/errors";

export { normalizeRepositoryAddress } from "repository/application/installations/core/repositorySettings";
