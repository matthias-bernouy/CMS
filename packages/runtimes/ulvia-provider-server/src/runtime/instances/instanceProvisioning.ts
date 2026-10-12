import { createLocalUser } from "@bernouy/cms-auth/management";
import type { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import type { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import type {
    OfficialInstanceProfile,
    OfficialInstanceProvisioningTarget,
    ProviderInstanceAdministrator,
    ProviderInstanceRecord,
    ProviderInstanceCredentials,
} from "@bernouy/ulvia-provider";
import type { ProviderRuntimeEnv } from "../../runtimeEnv";
import type { InstanceComposition } from "./ProviderInstanceHost";
import { loadOfficialManifest } from "./officialArtifacts";

const SITE_ID = "default";
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
        importManifest: async () => {
            await options.composition.management.importManifest(await loadOfficialManifest(options.providerSource));
        },
        connectProvider: (profile) => connectProvider(options, profile),
        selectContracts: (profile) => selectContracts(options.composition, profile),
        installCollection: (profile) => installCollection(options, profile),
        initializeAdministrator: (administrator) => initializeAdministrator(options.composition, administrator),
    };
}

async function connectProvider(options: TargetOptions, profile: OfficialInstanceProfile): Promise<void> {
    const state = await options.composition.management.list();
    const installation = state.installations.find(
        (item) => item.providerId === profile.manifest.providerId && item.accountId === options.instance.id,
    );
    if (installation && connectionIsReady(installation, options, profile)) {
        return;
    }
    const credentials = await options.credentials.read(options.instance.id);
    if (!credentials) {
        throw new Error(`Provider instance token is unavailable: ${options.instance.id}`);
    }
    const preview = await options.composition.management.preview(
        {
            providerId: profile.manifest.providerId,
            version: profile.manifest.version,
            endpoint: options.env.ULVIA_PROVIDER_PUBLIC_URL,
            token: credentials.token,
            ...(installation ? { installationId: installation.id, revision: installation.revision } : {}),
        },
        BOOTSTRAP_ACTOR,
    );
    const approved = await options.composition.management.approve(preview.ticket, BOOTSTRAP_ACTOR);
    if (!approved.observed) {
        throw new Error("Official Provider observation was not persisted");
    }
}

async function selectContracts(composition: InstanceComposition, profile: OfficialInstanceProfile): Promise<void> {
    const state = await composition.management.list();
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

async function installCollection(options: TargetOptions, profile: OfficialInstanceProfile): Promise<void> {
    const entry = (await options.collectionSource.list()).find(
        (candidate) =>
            candidate.publisherId === profile.collection.publisherId &&
            candidate.collectionId === profile.collection.collectionId &&
            candidate.version === profile.collection.version &&
            candidate.digest === profile.collection.digest,
    );
    if (!entry) {
        throw new Error("Exact official administration collection is unavailable");
    }
    const bundle = await options.collectionSource.get(entry);
    const imported = await options.composition.stores.collections.importRelease(bundle.release, bundle.assets);
    if (imported.digest !== profile.collection.digest) {
        throw new Error("Official administration collection digest mismatch");
    }
    const snapshot = await options.composition.stores.collections.snapshot(SITE_ID);
    const installed = snapshot.collections.find(({ collectionId }) => collectionId === entry.collectionId);
    if (installed?.digest === imported.digest) {
        return;
    }
    const method = installed ? "upgrade" : "install";
    await options.composition.stores.collections[method](
        SITE_ID,
        imported.digest,
        snapshot.revision,
        options.collectionSource.id,
    );
}

async function initializeAdministrator(
    composition: InstanceComposition,
    administrator: ProviderInstanceAdministrator,
): Promise<void> {
    const stores = composition.stores;
    if (!(await stores.identityProviders.get("local"))) {
        await stores.identityProviders.create({
            id: "local",
            kind: "local",
            enabled: true,
            displayName: "Email & password",
        });
    }
    const existing = await stores.credentials.getByEmail(administrator.email);
    const subjectId = existing
        ? `local:${existing.sub}`
        : (
              await createLocalUser(
                  { credentials: stores.credentials, users: stores.users },
                  { ...administrator, emailVerified: true },
              )
          ).sub;
    const now = new Date();
    await stores.db
        .collection("cms_administrator_grants")
        .updateOne(
            { sub: subjectId },
            { $setOnInsert: { sub: subjectId, enabled: true, revision: 1, createdAt: now, updatedAt: now } },
            { upsert: true },
        );
}
