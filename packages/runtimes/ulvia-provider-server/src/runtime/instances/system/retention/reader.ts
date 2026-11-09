import { readStoredPlan } from "../execution/plan";
import type { ProviderExecutionSupport } from "../execution/support";
import { readInstalledExecution } from "../execution/installed";
import type { MongoClient } from "mongodb";
import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { RetentionReader } from "./interfaces";
import {
    MongoContractSelectionStore,
    MongoProviderInstallationStore,
    MongoProviderManifestCatalogue,
} from "@bernouy/repository/providers/mongo";
import { MongoReleaseCatalogue } from "@bernouy/repository/contracts/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/repository/providers/selections";
import { MongoSiteUpgradeStorage } from "@bernouy/repository/upgrades/mongo";
import type { ContractSelection } from "@bernouy/ulvia-providers/selections";
import { instanceDatabaseName } from "../../../stores/storageRoots";

export function managedReleaseReader(
    mongo: MongoClient,
    support: ProviderExecutionSupport,
    endpoint: string,
): RetentionReader {
    const scope = (instance: ProviderInstanceRecord) => {
        const db = mongo.db(instanceDatabaseName(instance.storageKey));
        const releases = new MongoReleaseCatalogue(db);
        const manifests = new MongoProviderManifestCatalogue(db, releases);
        const installations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
        const selections = new MongoContractSelectionStore(
            db,
            new CatalogueSelectionDependencies(releases, manifests, installations),
        );
        return { releases, manifests, installations, selections, upgrades: new MongoSiteUpgradeStorage(db) };
    };
    return {
        assertPlan: async (instance, plan) => {
            await readStoredPlan(plan, scope(instance), support);
        },
        async required(instance, targetNotAdmitted) {
            const { releases, manifests, installations, selections, upgrades } = scope(instance);
            if (instance.status === "upgrading" && instance.systemPlan && !targetNotAdmitted) {
                await readStoredPlan(instance.systemPlan, { releases, manifests }, support);
            }
            const [selected, installed, active] = await Promise.all([
                selections.get("default"),
                installations.list("default"),
                upgrades.getActive("default"),
            ]);
            const execution =
                instance.status === "ready" || instance.status === "disabled"
                    ? await readInstalledExecution(
                          instance,
                          { releases, manifests, installations, selections },
                          support,
                          endpoint,
                      )
                    : undefined;
            const owned = new Set(
                installed
                    .filter(
                        ({ installation }) =>
                            installation.providerId === support.providerId && installation.accountId === instance.id,
                    )
                    .map(({ installation }) => installation.id),
            );
            const pending =
                active?.kind === "contracts"
                    ? await upgrades.get<{ selections: readonly ContractSelection[] }>(
                          "default",
                          active.id,
                          "contracts",
                      )
                    : null;
            const retained = [...(selected?.plan.selections ?? []), ...(pending?.payload.selections ?? [])]
                .filter(({ installationId }) => owned.has(installationId))
                .map((pin) => ({
                    contractId: pin.contractId,
                    version: pin.version,
                    digest: pin.digest,
                    location: `instance:${instance.id}/selection-or-transition`,
                }));
            return [
                ...retained,
                ...(execution?.plan.contracts ?? []).map((pin) => ({
                    ...pin,
                    location: `instance:${instance.id}/implementation`,
                })),
            ];
        },
    };
}
