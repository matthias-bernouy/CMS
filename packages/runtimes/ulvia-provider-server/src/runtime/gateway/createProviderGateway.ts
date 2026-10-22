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
    const resolveSecret = createSecretResolver(stores.secrets);
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
        authorize: access.authorize,
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
        const secret = await resolveSecret(route.installation.installation.providerTokenRef);
        if (!secret) {
            throw new Error("Provider invocation credential is unavailable");
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

    return {
        siteId,
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
