import type { LocalCredentialStore } from "@bernouy/cms-auth";
import { CapabilityGateway, CatalogueGatewayRouteResolver, SelectedGatewayCatalogue } from "@bernouy/cms-gateway";
import { MongoGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit/mongo";
import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import type { IdentityService } from "@bernouy/cms-gateway/identity";
import { ProviderImageService } from "@bernouy/cms-gateway/media";
import { DefaultCollectionPageExecutionAuthority } from "@bernouy/cms-gateway/execution";
import { MongoCollectionPageExecutionGrantStore } from "@bernouy/cms-gateway/execution/mongo";
import { LocalProviderImageStore } from "@bernouy/cms-gateway/media/local-fs";
import { SharpImageTransformer } from "@bernouy/cms-gateway/media/sharp";
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
    mediaDirectory: string,
) {
    const releases = new MongoReleaseCatalogue(db);
    await db.collection("cms_administrator_grants").createIndex({ sub: 1 }, { unique: true });
    const manifests = new MongoProviderManifestCatalogue(db, releases);
    const installations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
    await installations.init();
    const dependencies = new CatalogueSelectionDependencies(releases, manifests, installations);
    const selections = new MongoContractSelectionStore(db, dependencies);
    const routes = new CatalogueGatewayRouteResolver({ selections, installations, releases, manifests });
    const pageExecutions = new DefaultCollectionPageExecutionAuthority(
        selections,
        routes,
        new MongoCollectionPageExecutionGrantStore(db),
    );
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
    const access = createProductionGatewayAccess(credentials, administratorEmail, db);
    const commandAudit = new MongoGatewayCommandAuditStore(db);
    await commandAudit.init();
    const invoker = new CapabilityGateway({
        routes,
        identities: new ProviderIdentityAliases(legacyIdentities),
        transport: new HttpGatewayTransport({ network }),
        authorize: access.authorize,
        commandAudit,
    });
    const imageStore = new LocalProviderImageStore(mediaDirectory);
    await imageStore.initialize();
    const images = new ProviderImageService({ invoker, transformer: new SharpImageTransformer(), store: imageStore });
    return {
        siteId,
        releases,
        manifests,
        installations,
        selections,
        invoker,
        access: invoker,
        images,
        catalogue,
        pageExecutions,
        commandAudit,
        observations,
        isAdministrator: access.isAdministrator,
        administrators: access.administrators,
    };
}

export type ProductionGateway = Awaited<ReturnType<typeof createProductionGateway>>;
