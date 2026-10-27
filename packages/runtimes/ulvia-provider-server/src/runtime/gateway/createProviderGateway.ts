import { ContractUpgradeService } from "@bernouy/cms-repository/providers/selections";
import { capabilityGranted } from "@bernouy/cms-repository/providers/selections";
import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { CapabilityGateway, CatalogueGatewayRouteResolver } from "@bernouy/cms-gateway";
import { MongoGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit/mongo";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { createInvocationIssuer } from "./providers/issueInvocation";
import { createSecretResolver } from "@bernouy/secret-store";
import type { ProviderStores } from "../stores/providerStores";
import { RefreshingProviderRoutes } from "./providers/RefreshingProviderRoutes";
import type { ProviderReportReader } from "@bernouy/cms-repository/providers/management";
import { createProviderGatewayAccess } from "./access";

export async function createProviderGateway(
    stores: ProviderStores,
    siteId: string,
    observations: { readReport: ProviderReportReader; reportFailure(installationId: string, error: unknown): void },
) {
    const { db, releases, manifests, installations, selections } = stores;
    const resolveSecret = createSecretResolver(stores.contractSecrets.installations);
    const routes = new RefreshingProviderRoutes(
        new CatalogueGatewayRouteResolver({ selections, installations, releases, manifests }),
        { installations, resolveSecret, ...observations },
    );
    const network = new NodeGatewayHttpNetwork({
        allowPrivateAddresses: true,
        resolveToken: async (reference) => {
            const token = await resolveSecret(reference);
            if (!token) {
                throw new Error("provider credential is unavailable");
            }
            return token;
        },
    });
    const access = await createProviderGatewayAccess(db, siteId, installations, manifests, resolveSecret);
    const commandAudit = new MongoGatewayCommandAuditStore(db);
    await commandAudit.init();
    const identities = new ProviderIdentityAliases(stores.identities);
    const invoker = new CapabilityGateway({
        routes,
        identities,
        transport: new HttpGatewayTransport({ network }),
        authorize: async (actor, capability, route) => {
            const current = await selections.get(siteId);
            return Boolean(
                current &&
                    capabilityGranted(current.grants, route.selection.contractId, capability.id) &&
                    (await access.authorize(actor, capability, route)),
            );
        },
        commandAudit,
    });
    const resolvePageCapability = async (contractId: string, capabilityId: string) => {
        const route = await routes.resolve(siteId, contractId);
        const capability = route?.requestedRelease.admission.release.capabilities.find(({ id }) => id === capabilityId);
        return route && capability
            ? {
                  access: capability.access,
                  version: route.requestedRelease.admission.release.version,
                  effect: capability.behavior.effect,
                  idempotency: capability.behavior.effect === "command" ? capability.behavior.idempotency : undefined,
                  outputType: capability.output.type,
              }
            : null;
    };
    const issueInvocation = createInvocationIssuer(siteId, routes, selections, access.providers, resolveSecret);

    const contractUpgrades = new ContractUpgradeService(
        stores.selectionChanges.store,
        stores.selectionChanges.dependencies,
        stores.upgradeStorage,
        {
            protectedContracts: ["ulvia.cms.installations"],
            usage: async () => {
                const inventory = await stores.collectionUpgrades.inventory(siteId);
                return {
                    complete: inventory.complete,
                    revision: inventory.digest,
                    unknown: inventory.unknown,
                    requirements: inventory.references.flatMap((reference) =>
                        reference.type !== "resource" && reference.scope === "runtime" ? [reference] : [],
                    ),
                };
            },
            served: async (selection) => {
                const stored = await installations.get({ siteId, installationId: selection.installationId });
                const report = stored?.observation?.report;
                const served = report?.implementations.find(
                    (implementation) =>
                        implementation.contractId === selection.contractId &&
                        implementation.version === selection.version &&
                        implementation.digest === selection.digest,
                );
                return {
                    available: stored?.installation.status === "enabled" && served?.status === "ready",
                    revision: JSON.stringify({
                        installation: stored?.installation,
                        instanceId: report?.instanceId,
                        manifest: report?.manifest,
                        implementations: report?.implementations,
                    }),
                };
            },
        },
    );

    return {
        siteId,
        contractUpgrades,
        releases,
        manifests,
        installations,
        selections,
        routes,
        invoker,
        commandAudit,
        invocations: { issue: issueInvocation },
        providers: access.providers,
        resolvePageCapability,
        identities,
        isAdministrator: access.isAdministrator,
        administrators: access.administrators,
    };
}
