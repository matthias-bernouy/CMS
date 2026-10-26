import { ContractUpgradeService } from "@bernouy/cms-repository/providers/selections";
import { capabilityGranted } from "@bernouy/cms-repository/providers/selections";
import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { CapabilityGateway, CatalogueGatewayRouteResolver } from "@bernouy/cms-gateway";
import { MongoGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit/mongo";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { signProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { createSecretResolver } from "@bernouy/secret-store";
import type { ProviderStores } from "../stores/providerStores";
import { createProviderGatewayAccess } from "./access";

export async function createProviderGateway(stores: ProviderStores, siteId: string) {
    const { db, releases, manifests, installations, selections } = stores;
    const routes = new CatalogueGatewayRouteResolver({ selections, installations, releases, manifests });
    const resolveSecret = createSecretResolver(stores.contractSecrets.installations);
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
    const access = createProviderGatewayAccess(db, siteId, installations, manifests);
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
    const authenticateProvider = async (token: string): Promise<string | null> => {
        if (!/^[\x21-\x7e]{20,4096}$/u.test(token)) {
            return null;
        }
        for (const candidate of await installations.list(siteId)) {
            const reference = candidate.installation.gatewayTokenRef;
            const expected = reference ? await resolveSecret(reference).catch(() => null) : null;
            if (candidate.installation.status === "enabled" && expected && constantTimeEqual(token, expected)) {
                return candidate.installation.id;
            }
        }
        return null;
    };
    const resolvePageCapability = async (contractId: string, capabilityId: string) => {
        const route = await routes.resolve(siteId, contractId);
        const capability = route?.release.admission.release.capabilities.find(({ id }) => id === capabilityId);
        return route && capability
            ? {
                  access: capability.access,
                  version: route.release.admission.release.version,
                  effect: capability.behavior.effect,
                  idempotency: capability.behavior.effect === "command" ? capability.behavior.idempotency : undefined,
                  outputType: capability.output.type,
              }
            : null;
    };
    const issueInvocation = async (input: {
        requestId: string;
        installationId: string;
        contractId: string;
        contractVersion: string;
        capabilityId: string;
        subjectId?: string;
    }) => {
        const route = await routes.resolve(siteId, input.contractId);
        const release = route?.release.admission.release;
        const instanceId = route?.installation.observation?.report.instanceId;
        if (
            !route ||
            route.installation.installation.id !== input.installationId ||
            release?.version !== input.contractVersion ||
            !release.capabilities.some(({ id }) => id === input.capabilityId) ||
            !instanceId
        ) {
            throw Object.assign(new Error("Gateway invocation route is unavailable"), { code: "route_not_found" });
        }
        const current = await selections.get(siteId);
        if (!current || !capabilityGranted(current.grants, input.contractId, input.capabilityId)) {
            throw Object.assign(new Error("Capability is not granted for this site"), {
                code: "forbidden",
                status: 403,
            });
        }
        const secret = await resolveSecret(route.installation.installation.providerTokenRef);
        if (!secret) {
            throw new Error("Provider invocation credential is unavailable");
        }
        if (!(await routes.isCurrent(route))) {
            throw Object.assign(new Error("Invocation authorization changed"), { code: "stale_route", status: 409 });
        }
        const issuedAt = Math.floor(Date.now() / 1_000);
        return {
            instanceId,
            token: signProviderInvocationToken(secret, {
                version: 1,
                requestId: input.requestId,
                instanceId,
                contractId: input.contractId,
                contractVersion: input.contractVersion,
                capabilityId: input.capabilityId,
                ...(input.subjectId ? { subjectId: input.subjectId } : {}),
                issuedAt,
                expiresAt: issuedAt + 30,
            }),
        };
    };

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
        authenticateProvider,
        resolvePageCapability,
        identities,
        isAdministrator: access.isAdministrator,
        administrators: access.administrators,
    };
}

function constantTimeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
}
