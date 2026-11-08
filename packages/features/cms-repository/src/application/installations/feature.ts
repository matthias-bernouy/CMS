import { defineFeature } from "@bernouy/ulvia-sdk";
import { mapInstallationError } from "cms-repository/application/installations/capabilities/policy/mapError";
import { gatewayAuditAppend } from "cms-repository/application/installations/capabilities/gateway/routing/gateway.audit.append";
import { applyCollectionUpgrade } from "cms-repository/application/installations/capabilities/upgrades/collections/apply-collection-upgrade";
import { applyContractUpgrade } from "cms-repository/application/installations/capabilities/upgrades/contracts/apply-contract-upgrade";
import { approveProviderConnection } from "cms-repository/application/installations/capabilities/providers/administration/approve-provider-connection";
import { gatewayDelegationClose } from "cms-repository/application/installations/capabilities/gateway/delegation/gateway.delegation.close";
import { importProviderManifest } from "cms-repository/application/installations/capabilities/providers/administration/import-provider-manifest";
import { installCollection } from "cms-repository/application/installations/capabilities/collections/install-collection";
import { gatewayDelegationIssue } from "cms-repository/application/installations/capabilities/gateway/delegation/gateway.delegation.issue";
import { gatewayInvocationIssue } from "cms-repository/application/installations/capabilities/gateway/invocation/gateway.invocation.issue";
import { pairProviderConnection } from "cms-repository/application/installations/capabilities/providers/administration/pair-provider-connection";
import { gatewayDispatchPrepare } from "cms-repository/application/installations/capabilities/gateway/invocation/gateway.dispatch.prepare";
import { gatewayProviderPrepare } from "cms-repository/application/installations/capabilities/gateway/invocation/gateway.provider.prepare";
import { previewProviderConnection } from "cms-repository/application/installations/capabilities/providers/administration/preview-provider-connection";
import { gatewayIdentityResolve } from "cms-repository/application/installations/capabilities/gateway/routing/gateway.identity.resolve";
import { gatewayProviderResolve } from "cms-repository/application/installations/capabilities/gateway/authority/gateway.provider.resolve";
import { resumeCollectionUpgrade } from "cms-repository/application/installations/capabilities/upgrades/collections/resume-collection-upgrade";
import { resumeContractUpgrade } from "cms-repository/application/installations/capabilities/upgrades/contracts/resume-contract-upgrade";
import { setProviderStatus } from "cms-repository/application/installations/capabilities/providers/reads/set-provider-status";
import { updateCollectionConfiguration } from "cms-repository/application/installations/capabilities/collections/update-collection-configuration";
import { gatewayProviderAuthorize } from "cms-repository/application/installations/capabilities/gateway/authority/gateway.provider.authorize";
import { gatewayDelegationCheck } from "cms-repository/application/installations/capabilities/gateway/delegation/gateway.delegation.check";
import { capabilitiesDescribe } from "cms-repository/application/installations/capabilities/discovery/capabilities.describe";
import { documentationGet } from "cms-repository/application/installations/capabilities/discovery/documentation.get";
import { documentationSearch } from "cms-repository/application/installations/capabilities/discovery/documentation.search";
import { getCollectionInstallation } from "cms-repository/application/installations/capabilities/collections/get-collection-installation";
import { getCollectionUpgrade } from "cms-repository/application/installations/capabilities/upgrades/collections/get-collection-upgrade";
import { getContractUpgrade } from "cms-repository/application/installations/capabilities/upgrades/contracts/get-contract-upgrade";
import { gatewayRouteGet } from "cms-repository/application/installations/capabilities/gateway/routing/gateway.route.get";
import { getOperation } from "cms-repository/application/installations/capabilities/operations/get-operation";
import { getProviderAccess } from "cms-repository/application/installations/capabilities/providers/administration/get-provider-access";
import { getProviderInstallation } from "cms-repository/application/installations/capabilities/providers/reads/get-provider-installation";
import { getSiteUpgradeStatus } from "cms-repository/application/installations/capabilities/upgrades/collections/get-site-upgrade-status";
import { listAvailableCollections } from "cms-repository/application/installations/capabilities/collections/list-available-collections";
import { listAvailableProviders } from "cms-repository/application/installations/capabilities/providers/administration/list-available-providers";
import { listCollectionInstallations } from "cms-repository/application/installations/capabilities/collections/list-collection-installations";
import { listOperations } from "cms-repository/application/installations/capabilities/operations/list-operations";
import { listProviderInstallations } from "cms-repository/application/installations/capabilities/providers/reads/list-provider-installations";
import { listSiteUsage } from "cms-repository/application/installations/capabilities/collections/list-site-usage";
import { planCollectionUpgrade } from "cms-repository/application/installations/capabilities/upgrades/collections/plan-collection-upgrade";
import { planContractUpgrade } from "cms-repository/application/installations/capabilities/upgrades/contracts/plan-contract-upgrade";
import { repositoryGet } from "cms-repository/application/installations/capabilities/discovery/repository.get";
import { repositorySearch } from "cms-repository/application/installations/capabilities/discovery/repository.search";
export const installationsFeature = defineFeature({
    contractId: "ulvia/cms.installations",
    name: "CMS Installations",
    description:
        "Inspect and administer the collection installations, provider installations and contract selections of one CMS instance.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { icon: "installations", categories: ["administration", "content", "infrastructure"] },
    documents: new URL("../../../docs/installations/", import.meta.url),
    mapError: mapInstallationError,
    capabilities: [
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
} from "cms-repository/application/installations/interfaces/services";
export type { InstallationGateway } from "cms-repository/application/installations/interfaces/gateway";
export type {
    InstallationManagement,
    ProviderAdministration,
} from "cms-repository/application/installations/interfaces/management";
export type { InstallationOperationQueries } from "cms-repository/application/installations/interfaces/operations";
export type * from "cms-repository/application/installations/interfaces/outputs";
