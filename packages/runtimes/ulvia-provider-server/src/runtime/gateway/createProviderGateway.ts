import { gatewayObservability } from "@bernouy/cms-gateway/observability/node";
import { ContractUpgradeService } from "@bernouy/cms-repository/providers/selections";
import { capabilityGranted } from "@bernouy/cms-repository/providers/selections";
import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { CapabilityGateway, CatalogueGatewayRouteResolver, GatewayDispatchRejected } from "@bernouy/cms-gateway";
import { MongoGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit/mongo";
import { createDelegationAuthority } from "./providers/authority/delegations";
import { invocationAuthority } from "@bernouy/cms-gateway/http";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { createInvocationIssuer } from "./providers/authority/issueInvocation";
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
        authorize: async (request) => {
            try {
                return { token: (await issueInvocation(invocationAuthority(request))).token };
            } catch (error) {
                const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
                const denied = error && typeof error === "object" && "code" in error && error.code === "not_authorized";
                if (status === 403 || status === 429 || denied) {
                    throw new GatewayDispatchRejected(status === 429 ? "rate_limited" : "not_authorized");
                }
                throw error;
            }
        },
    });
    const access = await createProviderGatewayAccess(
        db,
        siteId,
        installations,
        manifests,
        selections,
        routes,
        resolveSecret,
    );
    const commandAudit = new MongoGatewayCommandAuditStore(db);
    await commandAudit.init();
    const identities = new ProviderIdentityAliases(stores.identities);
    let invoker: CapabilityGateway;
    const delegations = await createDelegationAuthority({
        db,
        siteId,
        routes,
        selections,
        resolveSecret,
        invoker: () => invoker,
    });
    invoker = new CapabilityGateway({
        ...gatewayObservability(stores.logger),
        delegations,
        transportFencesRoute: true,
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
    const issueInvocation = createInvocationIssuer(
        siteId,
        routes,
        selections,
        access.providers,
        resolveSecret,
        delegations,
        identities,
        async (subjectId) => {
            const result = await invoker.invoke({
                siteId,
                contractId: "ulvia.cms.access",
                capabilityId: "inspect-actor",
                input: { subjectId },
                actor: { kind: "system", serviceId: "cms-gateway" },
            });
            if (result.kind !== "success" || !result.output || typeof result.output !== "object") {
                return null;
            }
            const actor = result.output as Record<string, unknown>;
            return actor.state === "authenticated" &&
                actor.subjectId === subjectId &&
                typeof actor.administrator === "boolean"
                ? actor.administrator
                    ? "administrator"
                    : "user"
                : null;
        },
    );

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
        delegations,
        providers: access.providers,
        resolvePageCapability,
        identities,
        isAdministrator: access.isAdministrator,
        administrators: access.administrators,
    };
}
