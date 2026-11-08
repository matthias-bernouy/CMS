import { readStoredPlan } from "./execution/plan";
import type { SystemInstallationPlan } from "@bernouy/ulvia-provider";
import type { ProviderExecutionSupport } from "./execution/support";
import { readInstalledExecution } from "./execution/installed";
import type { MongoClient } from "mongodb";
import type {
    SystemInstallationSource,
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
    readRequired: (
        instance: ProviderInstanceRecord,
        retained?: readonly SystemInstallationPlan[],
    ) => Promise<readonly RequiredRelease[]>,
    system: SystemInstallationSource,
): Promise<void> {
    for (const transition of transitions) {
        if (
            transition.status !== "succeeded" &&
            (!transition.targetPlan || !["provision", "registry"].includes(transition.kind))
        ) {
            throw new Error(
                `Provider image cannot recover transition:${transition.id}; finish it with the original image`,
            );
        }
    }
    for (const instance of instances) {
        if (instance.status === "upgrading" && !instance.systemPlan) {
            throw new Error(`Provider image cannot recover instance:${instance.id}; finish it with the original image`);
        }
    }
    const plans = [
        ...instances
            .filter(({ status }) => status !== "ready" && status !== "disabled" && status !== "upgrading")
            .map((instance) => ({ plan: instance.systemPlan, location: `instance:${instance.id}` })),
        ...transitions
            .filter(({ status, kind }) => status !== "succeeded" && kind === "provision")
            .map((transition) => ({ plan: transition.targetPlan, location: `transition:${transition.id}` })),
    ];
    const current = plans.length ? await system.current() : undefined;
    for (const { plan, location } of plans) {
        if (!plan || plan.manifest.digest !== current?.manifest.digest) {
            throw new Error(
                `Provider image cannot recover ${location}; finish its system transition with the original image`,
            );
        }
        for (const release of plan.contracts) {
            support.assert(release, location);
        }
    }
    for (const instance of instances) {
        const registryPlans = transitions
            .filter(
                (transition) =>
                    transition.instanceId === instance.id &&
                    transition.status !== "succeeded" &&
                    transition.kind === "registry",
            )
            .map(({ targetPlan }) => targetPlan);
        for (const plan of registryPlans) {
            if (!plan) {
                throw new Error("Registry transition has no exact admitted plan");
            }
            for (const pin of plan.contracts) {
                support.assert(pin, `transition:${instance.id}`);
            }
        }
        for (const release of await readRequired(instance, registryPlans)) {
            support.assert(release, release.location);
        }
    }
}

export function managedReleaseReader(mongo: MongoClient, support: ProviderExecutionSupport, endpoint: string) {
    return async (
        instance: ProviderInstanceRecord,
        retainedPlans: readonly SystemInstallationPlan[] = [],
    ): Promise<readonly RequiredRelease[]> => {
        const db = mongo.db(instanceDatabaseName(instance.storageKey));
        const releases = new MongoReleaseCatalogue(db);
        const manifests = new MongoProviderManifestCatalogue(db, releases);
        const installations = new MongoProviderInstallationStore(db, manifests, () => new Date().toISOString());
        const selections = new MongoContractSelectionStore(
            db,
            new CatalogueSelectionDependencies(releases, manifests, installations),
        );
        const upgrades = new MongoSiteUpgradeStorage(db);
        const plans = [
            ...retainedPlans,
            ...(instance.status === "upgrading" && instance.systemPlan ? [instance.systemPlan] : []),
        ];
        for (const plan of plans) {
            await readStoredPlan(plan, { releases, manifests }, support);
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
            ...(execution?.plan.contracts ?? []).map((pin) => ({
                ...pin,
                location: `instance:${instance.id}/implementation`,
            })),
        ];
    };
}
