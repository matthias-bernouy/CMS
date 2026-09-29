import type { LocalCredentialStore } from "@bernouy/cms-auth";
import { CapabilityGateway, CatalogueGatewayRevisionSource, CatalogueGatewayRouteResolver } from "@bernouy/cms-gateway";
import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/node-http";
import type { IdentityService } from "@bernouy/cms-gateway/identity";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import {
    MongoProviderManifestCatalogue,
    MongoProviderInstallationStore,
    MongoContractSelectionStore,
} from "@bernouy/cms-repository/providers/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/cms-repository/providers/selections";
import { createSecretResolver, type SecretStore } from "@bernouy/cms-secrets";
import type { Db } from "mongodb";
import { createProductionGatewayAccess } from "./access";

export async function createProductionGateway(
    db: Db,
    secrets: SecretStore,
    credentials: LocalCredentialStore,
    legacyIdentities: IdentityService,
    siteId: string,
    administratorEmail: string,
) {
    const releases = new MongoReleaseCatalogue(db);
    const manifests = new MongoProviderManifestCatalogue(db, releases);
    const installations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
    await installations.init();
    const dependencies = new CatalogueSelectionDependencies(releases, manifests, installations);
    const selections = new MongoContractSelectionStore(db, dependencies);
    const revisions = new CatalogueGatewayRevisionSource(selections, dependencies);
    const routes = new CatalogueGatewayRouteResolver({ selections, revisions, installations, releases, manifests });
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
    const access = createProductionGatewayAccess(credentials, administratorEmail);
    const invoker = new CapabilityGateway({
        routes,
        identities: new ProviderIdentityAliases(legacyIdentities),
        transport: new HttpGatewayTransport({ network }),
        authorize: access.authorize,
    });
    return {
        siteId,
        invoker,
        isAdministrator: access.isAdministrator,
    };
}

export type ProductionGateway = Awaited<ReturnType<typeof createProductionGateway>>;
