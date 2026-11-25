import { MongoReleaseCatalogue } from "@bernouy/repository/contracts/mongo";
import {
    MongoProviderManifestCatalogue,
    MongoProviderInstallationStore,
    MongoContractSelectionStore,
} from "@bernouy/repository/providers/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/repository/providers/selections";
import type { Db } from "mongodb";
export function migrationStores(db: Db) {
    const releases = new MongoReleaseCatalogue(db),
        manifests = new MongoProviderManifestCatalogue(db, releases);
    const installations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
    const dependencies = new CatalogueSelectionDependencies(releases, manifests, installations);
    return {
        releases,
        manifests,
        installations,
        dependencies,
        selections: new MongoContractSelectionStore(db, dependencies),
    };
}
