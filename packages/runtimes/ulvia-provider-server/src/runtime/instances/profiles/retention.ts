import type { ProviderExecutionSupport } from "./execution/support";
import { readInstalledExecution } from "./execution/installed";
import type { MongoClient } from "mongodb";
import type {
    OfficialInstanceProfileSource,
    ProviderInstanceRecord,
    InstanceTransitionRecord,
} from "@bernouy/ulvia-provider";
import {
    MongoContractSelectionStore,
    MongoProviderInstallationStore,
    MongoProviderManifestCatalogue,
} from "@bernouy/repository/providers/mongo";
import { MongoReleaseCatalogue } from "@bernouy/repository/contracts/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/repository/providers/selections";
import { MongoSiteUpgradeStorage } from "@bernouy/repository/upgrades/mongo";
import type { ContractSelection } from "@bernouy/ulvia-providers/selections";
import { instanceDatabaseName } from "../../stores/storageRoots";

type RequiredRelease = Readonly<{ contractId: string; version: string; digest: string; location: string }>;

/** The check runs before listeners and recovery workers can mutate the managed instance registry. */
export async function assertHostedReleaseRetention(
    support: ProviderExecutionSupport,
    instances: readonly ProviderInstanceRecord[],
    transitions: readonly InstanceTransitionRecord[],
    readRequired: (instance: ProviderInstanceRecord) => Promise<readonly RequiredRelease[]>,
    profiles: OfficialInstanceProfileSource,
): Promise<void> {
    const requiredProfiles = [
        ...instances
            .filter(({ status }) => status !== "ready" && status !== "disabled")
            .map((instance) => ({ ...instance.profile, location: `instance:${instance.id}` })),
        ...transitions
            .filter(({ status }) => status !== "succeeded")
            .flatMap((transition) =>
                [transition.sourceProfile, transition.targetProfile].flatMap((pin) =>
                    pin ? [{ ...pin, location: `transition:${transition.id}` }] : [],
                ),
            ),
    ];
    for (const pin of requiredProfiles) {
        if (!(await profiles.resolve(pin.id, pin.version))) {
            throw new Error(`Provider image would drop profile ${pin.id}@${pin.version} required by ${pin.location}`);
        }
    }
    for (const instance of instances) {
        for (const release of await readRequired(instance)) {
            support.assert(release, release.location);
        }
    }
}

export function managedReleaseReader(mongo: MongoClient, support: ProviderExecutionSupport, endpoint: string) {
    return async (instance: ProviderInstanceRecord): Promise<readonly RequiredRelease[]> => {
        const db = mongo.db(instanceDatabaseName(instance.storageKey));
        const releases = new MongoReleaseCatalogue(db);
        const manifests = new MongoProviderManifestCatalogue(db, releases);
        const installations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
        const selections = new MongoContractSelectionStore(
            db,
            new CatalogueSelectionDependencies(releases, manifests, installations),
        );
        const upgrades = new MongoSiteUpgradeStorage(db);
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
                ? await upgrades.get<{ selections: readonly ContractSelection[] }>("default", active.id, "contracts")
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
            ...(execution?.profile.contracts ?? []).map((pin) => ({
                ...pin,
                location: `instance:${instance.id}/implementation`,
            })),
        ];
    };
}
