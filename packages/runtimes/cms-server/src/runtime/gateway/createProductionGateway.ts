import type { LocalCredentialStore } from "@bernouy/cms-auth";
import { CapabilityGateway, CatalogueGatewayRouteResolver, SelectedGatewayCatalogue } from "@bernouy/cms-gateway";
import { MongoGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit/mongo";
import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import type { IdentityService } from "@bernouy/cms-gateway/identity";
import { DefaultPageExecutionAuthority } from "@bernouy/cms-gateway/execution";
import { MongoPageExecutionGrantStore } from "@bernouy/cms-gateway/execution/mongo";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import {
    MongoProviderManifestCatalogue,
    MongoProviderInstallationStore,
    MongoContractSelectionStore,
} from "@bernouy/cms-repository/providers/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/cms-repository/providers/selections";
import { createSecretResolver, type SecretStore } from "@bernouy/secret-store";
import type { Db } from "mongodb";
import { createProductionGatewayAccess } from "./access";
import { ProviderObservationRefresher } from "./ProviderObservationRefresher";

export async function createProductionGateway(
    db: Db,
    secrets: SecretStore,
    credentials: LocalCredentialStore,
    legacyIdentities: IdentityService,
    siteId: string,
    administratorEmail: string,
) {
    const releases = new MongoReleaseCatalogue(db);
    await db.collection("cms_administrator_grants").createIndex({ sub: 1 }, { unique: true });
    await db
        .collection("cms_provider_capability_grants")
        .createIndex(
            { sourceInstallationId: 1, targetInstallationId: 1, contractId: 1, capabilityId: 1 },
            { unique: true },
        );
    await db.collection("cms_provider_capability_usage").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const manifests = new MongoProviderManifestCatalogue(db, releases);
    const installations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
    await installations.init();
    const dependencies = new CatalogueSelectionDependencies(releases, manifests, installations);
    const selections = new MongoContractSelectionStore(db, dependencies);
    const routes = new CatalogueGatewayRouteResolver({ selections, installations, releases, manifests });
    const pageExecutions = new DefaultPageExecutionAuthority(selections, routes, new MongoPageExecutionGrantStore(db));
    const catalogue = new SelectedGatewayCatalogue(selections, routes);
    const resolveSecret = createSecretResolver(secrets);
    const network = new NodeGatewayHttpNetwork({
        resolveToken: async (reference) => {
            const token = await resolveSecret(reference);
            if (!token) {
                throw new Error("provider credential is unavailable");
            }
            return token;
        },
    });
    const observations = new ProviderObservationRefresher(siteId, selections, installations, network);
    const access = createProductionGatewayAccess(credentials, administratorEmail, db, siteId, installations, manifests);
    const commandAudit = new MongoGatewayCommandAuditStore(db);
    await commandAudit.init();
    const identities = new ProviderIdentityAliases(legacyIdentities);
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
        const candidates = await installations.list(siteId);
        for (const candidate of candidates) {
            const reference = candidate.installation.gatewayTokenRef;
            if (candidate.installation.status !== "enabled" || !reference) {
                continue;
            }
            const expected = await resolveSecret(reference).catch(() => null);
            if (expected && constantTimeEqual(token, expected)) {
                return candidate.installation.id;
            }
        }
        return null;
    };
    return {
        siteId,
        releases,
        manifests,
        installations,
        selections,
        invoker,
        access: invoker,
        catalogue,
        pageExecutions,
        commandAudit,
        observations,
        authenticateProvider,
        identities,
        isAdministrator: access.isAdministrator,
        administrators: access.administrators,
        providerGrants: access.providerGrants,
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

export type ProductionGateway = Awaited<ReturnType<typeof createProductionGateway>>;
