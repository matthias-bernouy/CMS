import type { listCollectionReleasesInputSchema } from "repository/application/installations/schemas/collections/discovery/list-collection-releases";
import type { listCollectionCatalogueInputSchema } from "repository/application/installations/schemas/collections/discovery/list-collection-catalogue";
import type { getCollectionReleaseInputSchema } from "repository/application/installations/schemas/collections/discovery/get-collection-release";
import type { z } from "zod";
import type { installCollectionInputSchema } from "repository/application/installations/schemas/collections/install-collection";
import type { listSiteUsageInputSchema } from "repository/application/installations/schemas/collections/list-site-usage";
import type { gatewayProviderAuthorizeInputSchema } from "repository/application/installations/schemas/gateway/authority/gateway.provider.authorize";
import type { gatewayDelegationCheckInputSchema } from "repository/application/installations/schemas/gateway/delegation/gateway.delegation.check";
import type { gatewayDelegationCloseInputSchema } from "repository/application/installations/schemas/gateway/delegation/gateway.delegation.close";
import type { gatewayDelegationIssueInputSchema } from "repository/application/installations/schemas/gateway/delegation/gateway.delegation.issue";
import type { gatewayDispatchPrepareInputSchema } from "repository/application/installations/schemas/gateway/invocation/gateway.dispatch.prepare";
import type { gatewayIdentityResolveInputSchema } from "repository/application/installations/schemas/gateway/routing/gateway.identity.resolve";
import type { listOperationsInputSchema } from "repository/application/installations/schemas/operations/list-operations";
import type { importProviderManifestInputSchema } from "repository/application/installations/schemas/providers/administration/import-provider-manifest";
import type { planCollectionUpgradeInputSchema } from "repository/application/installations/schemas/upgrades/collections/plan-collection-upgrade";
import type { applyContractUpgradeInputSchema } from "repository/application/installations/schemas/upgrades/contracts/apply-contract-upgrade";
import type { planContractUpgradeInputSchema } from "repository/application/installations/schemas/upgrades/contracts/plan-contract-upgrade";
export type ApplyContractUpgradeInput = z.output<typeof applyContractUpgradeInputSchema>;
export type GatewayDelegationCloseInput = z.output<typeof gatewayDelegationCloseInputSchema>;
export type ImportProviderManifestInput = z.output<typeof importProviderManifestInputSchema>;
export type InstallCollectionInput = z.output<typeof installCollectionInputSchema>;
export type GatewayDelegationIssueInput = z.output<typeof gatewayDelegationIssueInputSchema>;
export type GatewayDispatchPrepareInput = z.output<typeof gatewayDispatchPrepareInputSchema>;
export type GatewayIdentityResolveInput = z.output<typeof gatewayIdentityResolveInputSchema>;
export type GatewayProviderAuthorizeInput = z.output<typeof gatewayProviderAuthorizeInputSchema>;
export type GatewayDelegationCheckInput = z.output<typeof gatewayDelegationCheckInputSchema>;
export type ListOperationsInput = z.output<typeof listOperationsInputSchema>;
export type ListSiteUsageInput = z.output<typeof listSiteUsageInputSchema>;
export type PlanCollectionUpgradeInput = z.output<typeof planCollectionUpgradeInputSchema>;
export type PlanContractUpgradeInput = z.output<typeof planContractUpgradeInputSchema>;

export type GetCollectionReleaseInput = z.output<typeof getCollectionReleaseInputSchema>;

export type ListCollectionCatalogueInput = z.output<typeof listCollectionCatalogueInputSchema>;

export type ListCollectionReleasesInput = z.output<typeof listCollectionReleasesInputSchema>;
