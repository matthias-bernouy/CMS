import type { MongoClient } from "mongodb";
import type {
    OfficialInstanceProfiles,
    ProviderInstanceRecord,
    InstanceTransitionRecord,
} from "@bernouy/ulvia-provider";
import {
    MongoContractSelectionStore,
    MongoProviderInstallationStore,
    MongoProviderManifestCatalogue,
} from "@bernouy/cms-repository/providers/mongo";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import { CatalogueSelectionDependencies } from "@bernouy/cms-repository/providers/selections";
import { MongoSiteUpgradeStorage } from "@bernouy/cms-repository/upgrades/mongo";
import type { ContractSelection } from "@bernouy/cms-repository/providers/selections";
import { instanceDatabaseName } from "../../stores/storageRoots";

type RequiredRelease = Readonly<{ contractId: string; version: string; digest: string; location: string }>;

/** The check runs before listeners and recovery workers can mutate the managed instance registry. */
export async function assertHostedReleaseRetention(
    profiles: OfficialInstanceProfiles,
    instances: readonly ProviderInstanceRecord[],
    transitions: readonly InstanceTransitionRecord[],
    readRequired: (instance: ProviderInstanceRecord) => Promise<readonly RequiredRelease[]>,
): Promise<void> {
    const supported = new Set(
        profiles.profiles.flatMap((profile) =>
            profile.contracts.map((pin) => `${pin.contractId}@${pin.version}:${pin.digest}`),
        ),
    );
    const requiredProfiles = [
        ...instances.map((instance) => ({ ...instance.profile, location: `instance:${instance.id}` })),
        ...transitions
            .filter(({ status }) => status !== "succeeded")
            .flatMap((transition) =>
                [transition.sourceProfile, transition.targetProfile].flatMap((pin) =>
                    pin ? [{ ...pin, location: `transition:${transition.id}` }] : [],
                ),
            ),
    ];
    for (const pin of requiredProfiles) {
        if (!profiles.resolve(pin.id, pin.version)) {
            throw new Error(`Provider image would drop profile ${pin.id}@${pin.version} required by ${pin.location}`);
        }
    }
    for (const instance of instances) {
        for (const release of await readRequired(instance)) {
            if (!supported.has(`${release.contractId}@${release.version}:${release.digest}`)) {
                throw new Error(
                    `Provider image would drop ${release.contractId}@${release.version} required by ${release.location}`,
                );
            }
        }
    }
}

export function managedReleaseReader(
    mongo: MongoClient,
    profiles: OfficialInstanceProfiles,
    instances: readonly ProviderInstanceRecord[],
) {
    const accounts = new Set(instances.map(({ id }) => id));
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
        const owned = new Set(
            installed
                .filter(
                    ({ installation }) =>
                        installation.providerId === profiles.defaultProfile.manifest.providerId &&
                        accounts.has(installation.accountId),
                )
                .map(({ installation }) => installation.id),
        );
        const pending =
            active?.kind === "contracts"
                ? await upgrades.get<{ selections: readonly ContractSelection[] }>("default", active.id, "contracts")
                : null;
        return [...(selected?.plan.selections ?? []), ...(pending?.payload.selections ?? [])]
            .filter(({ installationId }) => owned.has(installationId))
            .map((pin) => ({
                contractId: pin.contractId,
                version: pin.version,
                digest: pin.digest,
                location: `instance:${instance.id}/selection-or-transition`,
            }));
    };
}
