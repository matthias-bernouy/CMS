import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import {
    MongoContractSelectionStore,
    MongoProviderInstallationStore,
    MongoProviderManifestCatalogue,
} from "@bernouy/cms-repository/providers/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/cms-repository/providers/selections";
import type { ProviderStores } from "../stores/providerStores";
import { createProviderAdministrators } from "./createProviderAdministrators";

export async function createProviderGateway(stores: ProviderStores, siteId: string, administratorEmail: string) {
    const { db } = stores;
    const releases = new MongoReleaseCatalogue(db);
    await db.collection("cms_administrator_grants").createIndex({ sub: 1 }, { unique: true });
    const manifests = new MongoProviderManifestCatalogue(db, releases);
    const installations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
    await installations.init();
    const selections = new MongoContractSelectionStore(
        db,
        new CatalogueSelectionDependencies(releases, manifests, installations),
    );

    return {
        siteId,
        releases,
        manifests,
        installations,
        selections,
        administrators: createProviderAdministrators(stores.credentials, administratorEmail, db),
        identities: new ProviderIdentityAliases(stores.identities),
    };
}

export type ProviderGateway = Awaited<ReturnType<typeof createProviderGateway>>;
