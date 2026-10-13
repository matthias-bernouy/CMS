import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { CapabilityGateway, CatalogueGatewayRouteResolver } from "@bernouy/cms-gateway";
import { MongoGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit/mongo";
import { DefaultPageExecutionAuthority } from "@bernouy/cms-gateway/execution";
import { MongoPageExecutionGrantStore } from "@bernouy/cms-gateway/execution/mongo";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import {
    MongoContractSelectionStore,
    MongoProviderInstallationStore,
    MongoProviderManifestCatalogue,
} from "@bernouy/cms-repository/providers/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/cms-repository/providers/selections";
import { createSecretResolver } from "@bernouy/secret-store";
import type { ProviderStores } from "../stores/providerStores";
import { createProviderGatewayAccess } from "./access";

export async function createProviderGateway(stores: ProviderStores, siteId: string) {
    const { db } = stores;
    const releases = new MongoReleaseCatalogue(db);
    const manifests = new MongoProviderManifestCatalogue(db, releases);
    const installations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
    await installations.init();
    const selections = new MongoContractSelectionStore(
        db,
        new CatalogueSelectionDependencies(releases, manifests, installations),
    );
    const routes = new CatalogueGatewayRouteResolver({ selections, installations, releases, manifests });
    const pageExecutions = new DefaultPageExecutionAuthority(selections, routes, new MongoPageExecutionGrantStore(db));
    const resolveSecret = createSecretResolver(stores.secrets);
    const network = new NodeGatewayHttpNetwork({
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
            ? { access: capability.access, version: route.release.admission.release.version }
            : null;
    };

    return {
        siteId,
        releases,
        manifests,
        installations,
        selections,
        routes,
        invoker,
        pageExecutions,
        commandAudit,
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
