import type { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import type { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import type {
    OfficialInstanceProfile,
    OfficialInstanceProvisioningTarget,
    ProviderInstanceRecord,
    ProviderInstanceCredentials,
    ProviderInstanceTransitionExecution,
} from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../../runtimeEnv";
import type { InstanceComposition } from "./ProviderInstanceHost";
import { loadOfficialManifest } from "./officialArtifacts";
import { initializeOfficialAdministrator, installOfficialCollection } from "./instanceInitialization";

const BOOTSTRAP_ACTOR = "system:provider-provisioner";

type TargetOptions = Readonly<{
    instance: ProviderInstanceRecord;
    composition: InstanceComposition;
    env: ProviderRuntimeEnv;
    credentials: Pick<ProviderInstanceCredentials, "read">;
    providerSource: HttpProviderRepository;
    collectionSource: HttpCollectionRepository;
}>;

export function createInstanceProvisioningTarget(options: TargetOptions): OfficialInstanceProvisioningTarget {
    return {
        importManifest: async (_profile, execution) => {
            execution.throwIfLeaseLost();
            const manifest = await loadOfficialManifest(options.providerSource);
            execution.throwIfLeaseLost();
            await options.composition.management.importManifest(manifest);
            execution.throwIfLeaseLost();
        },
        connectProvider: (profile, execution) => connectProvider(options, profile, execution),
        selectContracts: (profile, execution) => selectContracts(options.composition, profile, execution),
        installCollection: (profile, execution) =>
            installOfficialCollection(options.composition, options.collectionSource, profile, execution),
        initializeAdministrator: (administrator, execution) =>
            initializeOfficialAdministrator(options.composition, administrator, execution),
    };
}

async function connectProvider(
    options: TargetOptions,
    profile: OfficialInstanceProfile,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    const management = options.composition.managementForProfile(profile);
    const state = await management.list();
    execution.throwIfLeaseLost();
    const installation = state.installations.find(
        (item) => item.providerId === profile.manifest.providerId && item.accountId === options.instance.id,
    );
    if (installation && connectionIsReady(installation, options, profile)) {
        return;
    }
    const credentials = await options.credentials.read(options.instance.id);
    execution.throwIfLeaseLost();
    if (!credentials) {
        throw new Error(`Provider instance token is unavailable: ${options.instance.id}`);
    }
    const preview = await management.preview(
        {
            providerId: profile.manifest.providerId,
            version: profile.manifest.version,
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
    profile: OfficialInstanceProfile,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    const state = await composition.management.list();
    execution.throwIfLeaseLost();
    const installation = state.installations.find(
        (item) =>
            item.providerId === profile.manifest.providerId && item.accountId === composition.runtime.report.instanceId,
    );
    if (!installation) {
        throw new Error("Official Provider installation is unavailable during provisioning");
    }
    for (const contract of profile.contracts) {
        const selected = state.selected.find((item) => item.contractId === contract.contractId);
        if (selected?.digest === contract.digest && selected.installationId === installation.id) {
            continue;
        }
        await composition.management.selectContract({ installationId: installation.id, ...contract });
        execution.throwIfLeaseLost();
    }
}

type ProviderInstallationState = Awaited<
    ReturnType<InstanceComposition["management"]["list"]>
>["installations"][number];

function connectionIsReady(
    installation: ProviderInstallationState,
    options: TargetOptions,
    profile: OfficialInstanceProfile,
): boolean {
    return (
        installation.status === "enabled" &&
        installation.endpoint === options.env.ULVIA_PROVIDER_PUBLIC_URL &&
        installation.manifestVersion === profile.manifest.version &&
        installation.manifestDigest === profile.manifest.digest &&
        installation.observedAt !== null &&
        profile.contracts.every((contract) =>
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
