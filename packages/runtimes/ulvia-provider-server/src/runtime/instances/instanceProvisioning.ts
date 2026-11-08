import type { CollectionRepositorySource } from "@bernouy/repository/collections/sources";
import { importProviderManifest } from "@bernouy/repository/providers/sources";
import type { ProviderRepositorySource } from "@bernouy/repository/providers/sources";
import type {
    SystemInstallationPlan,
    OfficialInstanceProvisioningTarget,
    ProviderInstanceRecord,
    ProviderInstanceCredentials,
    ProviderInstanceTransitionExecution,
} from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../../runtimeEnv";
import type { InstanceComposition } from "./composition/ProviderInstanceHost";
import { loadOfficialManifest } from "./system/artifacts";
import { initializeOfficialAdministrator } from "./instanceInitialization";

const BOOTSTRAP_ACTOR = "system:provider-provisioner";

type TargetOptions = Readonly<{
    instance: ProviderInstanceRecord;
    composition: InstanceComposition;
    env: ProviderRuntimeEnv;
    credentials: Pick<ProviderInstanceCredentials, "read">;
    providerSource: ProviderRepositorySource;
    collectionSource: CollectionRepositorySource;
}>;

export function createInstanceProvisioningTarget(options: TargetOptions): OfficialInstanceProvisioningTarget {
    return {
        importManifest: async (plan, execution) => {
            execution.throwIfLeaseLost();
            const manifest = await loadOfficialManifest(options.providerSource, plan);
            execution.throwIfLeaseLost();
            await importProviderManifest(
                manifest,
                [options.providerSource],
                options.composition.gateway.releases,
                options.composition.gateway.manifests,
            );
            execution.throwIfLeaseLost();
        },
        connectProvider: (plan, execution) => connectProvider(options, plan, execution),
        selectContracts: async (plan, execution) => {
            await selectContracts(options.composition, plan, execution);
            execution.throwIfLeaseLost();
            await options.composition.pairOfficialProvider();
            execution.throwIfLeaseLost();
        },
        initializeSetup: async (_plan, execution) => {
            if (
                options.composition.runtime.contracts.some(
                    (contract) =>
                        contract.release.contractId === "ulvia/cms.installations" &&
                        contract.capabilities.some(({ definition }) => definition.id === "initialization.entry"),
                )
            ) {
                execution.throwIfLeaseLost();
                await options.composition.stores.initializationState.initialize("default");
                execution.throwIfLeaseLost();
            }
        },
        initializeAdministrator: (administrator, execution) =>
            initializeOfficialAdministrator(options.composition, administrator, execution),
    };
}

async function connectProvider(
    options: TargetOptions,
    plan: SystemInstallationPlan,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    const management = options.composition.managementForPlan(
        plan,
        options.instance.status === "upgrading" ? execution : undefined,
    );
    const state = await management.list();
    execution.throwIfLeaseLost();
    const installation = state.installations.find(
        (item) => item.providerId === plan.manifest.providerId && item.accountId === options.instance.id,
    );
    if (installation?.status === "revoked") {
        throw new Error(
            `Official Provider installation was revoked and cannot be restored: ${installation.id}. Provision a new instance instead.`,
        );
    }
    if (installation && connectionIsReady(installation, options, plan)) {
        return;
    }
    const credentials = await options.credentials.read(options.instance.id);
    execution.throwIfLeaseLost();
    if (!credentials) {
        throw new Error(`Provider instance token is unavailable: ${options.instance.id}`);
    }
    const preview = await management.preview(
        {
            providerId: plan.manifest.providerId,
            version: plan.manifest.version,
            endpoint: options.env.ULVIA_PROVIDER_PUBLIC_URL,
            token: credentials.invocationSecret,
            ...(installation ? { installationId: installation.id, revision: installation.revision } : {}),
        },
        BOOTSTRAP_ACTOR,
    );
    execution.throwIfLeaseLost();
    const approved = await management.approve(preview.ticket, BOOTSTRAP_ACTOR);
    execution.throwIfLeaseLost();
    if (!approved.observed) {
        throw new Error("Official Provider observation was not persisted");
    }
}

async function selectContracts(
    composition: InstanceComposition,
    plan: SystemInstallationPlan,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    const [state, selected] = await Promise.all([
        composition.management.list(),
        composition.gateway.selections.get(composition.gateway.siteId),
    ]);
    execution.throwIfLeaseLost();
    const installation = state.installations.find(
        (item) =>
            item.providerId === plan.manifest.providerId && item.accountId === composition.runtime.report.instanceId,
    );
    if (!installation) {
        throw new Error("Official Provider installation is unavailable during provisioning");
    }
    if (
        plan.contracts.every((contract) =>
            state.selected.some(
                (current) =>
                    current.contractId === contract.contractId &&
                    current.version === contract.version &&
                    current.digest === contract.digest &&
                    current.installationId === installation.id,
            ),
        )
    ) {
        return;
    }
    const managedContractIds = new Set(plan.contracts.map(({ contractId }) => contractId));
    await composition.management.replaceSelections({
        expectedRevision: selected?.revision ?? 0,
        selections: [
            ...(selected?.plan.selections ?? []).filter(({ contractId }) => !managedContractIds.has(contractId)),
            ...plan.contracts.map((contract) => ({ ...contract, installationId: installation.id })),
        ],
    });
    execution.throwIfLeaseLost();
}

type ProviderInstallationState = Awaited<
    ReturnType<InstanceComposition["management"]["list"]>
>["installations"][number];

function connectionIsReady(
    installation: ProviderInstallationState,
    options: TargetOptions,
    plan: SystemInstallationPlan,
): boolean {
    return (
        installation.status === "enabled" &&
        installation.endpoint === options.env.ULVIA_PROVIDER_PUBLIC_URL &&
        installation.manifestVersion === plan.manifest.version &&
        installation.manifestDigest === plan.manifest.digest &&
        installation.observedAt !== null &&
        plan.contracts.every((contract) =>
            installation.contracts.some(
                (observed) =>
                    observed.contractId === contract.contractId &&
                    observed.version === contract.version &&
                    observed.digest === contract.digest &&
                    observed.status === "ready",
            ),
        )
    );
}
