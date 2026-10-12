import { ProviderIdentityAliases } from "@bernouy/cms-gateway/identity";
import { MongoAdministratorGrantStore } from "@bernouy/cms-gateway/execution/mongo";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import {
    MongoContractSelectionStore,
    MongoProviderInstallationStore,
    MongoProviderManifestCatalogue,
} from "@bernouy/cms-repository/providers/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/cms-repository/providers/selections";
import type { ProviderStores } from "../stores/providerStores";

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

    return {
        siteId,
        releases,
        manifests,
        installations,
        selections,
        administrators: new MongoAdministratorGrantStore(db),
        identities: new ProviderIdentityAliases(stores.identities),
    };
}
