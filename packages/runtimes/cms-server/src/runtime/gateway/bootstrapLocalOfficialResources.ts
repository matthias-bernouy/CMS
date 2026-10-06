import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import type { ProviderRepositorySource } from "@bernouy/cms-repository/providers/sources";
import type { RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import type { ProviderManagement } from "./ProviderManagement";

const PROVIDER_ID = "ulvia.official";
const CONTROL_COLLECTION_ID = "ulvia-official";
const CONTROL_COLLECTION_VERSION = "1.0.0";
const BOOTSTRAP_ACTOR = "system:local-bootstrap";
const CORE_CONTRACT_IDS = [
    "ulvia.cms.access",
    "ulvia.cms.collections",
    "ulvia.cms.design",
    "ulvia.cms.files",
    "ulvia.cms.operations",
    "ulvia.cms.pages",
    "ulvia.cms.providers",
] as const;

type Management = Pick<ProviderManagement, "importManifest" | "list" | "preview" | "approve" | "selectContract">;
type Collections = Pick<CollectionStore, "importRelease" | "snapshot" | "install" | "upgrade">;

export async function bootstrapLocalOfficialResources(options: {
    readonly management: Management;
    readonly collections: Collections;
    readonly repositoryUrl: string;
    readonly providerEndpoint: string;
    readonly providerToken: string;
    readonly providerSource?: ProviderRepositorySource;
    readonly collectionSource?: CollectionRepositorySource;
    readonly onManifestImported?: (entry: RepositoryArtifactEntry) => Promise<void>;
}): Promise<void> {
    const providerSource =
        options.providerSource ?? new HttpProviderRepository("local-bootstrap", options.repositoryUrl);
    const collectionSource =
        options.collectionSource ?? new HttpCollectionRepository("local-bootstrap", options.repositoryUrl);
    const manifestEntry = (await providerSource.list("provider-manifest"))
        .filter((entry) => entry.publisherId === PROVIDER_ID && entry.id === PROVIDER_ID)
        .sort((left, right) => compareSemVer(left.version, right.version))
        .at(-1);
    if (!manifestEntry) {
        throw new Error("The official local provider manifest is unavailable from the bootstrap repository");
    }
    await options.management.importManifest(await providerSource.get(manifestEntry));
    await options.onManifestImported?.(manifestEntry);

    let state = await options.management.list();
    let installation = state.installations.find((item) => item.providerId === PROVIDER_ID);
    if (installation?.status === "revoked" || installation?.status === "disabled") {
        throw new Error("The official local provider installation was administratively disabled");
    }
    const requiresConnection =
        !installation ||
        installation.endpoint !== options.providerEndpoint ||
        installation.manifestVersion !== manifestEntry.version ||
        CORE_CONTRACT_IDS.some(
            (contractId) =>
                !installation?.contracts.some(
                    (contract) => contract.contractId === contractId && contract.status === "ready",
                ),
        );
    if (requiresConnection) {
        const preview = await options.management.preview(
            {
                providerId: PROVIDER_ID,
                version: manifestEntry.version,
                endpoint: options.providerEndpoint,
                token: options.providerToken,
                ...(installation ? { installationId: installation.id, revision: installation.revision } : {}),
            },
            BOOTSTRAP_ACTOR,
        );
        await options.management.approve(preview.ticket, BOOTSTRAP_ACTOR);
        state = await options.management.list();
        installation = state.installations.find((item) => item.providerId === PROVIDER_ID);
    }
    if (!installation || installation.status !== "enabled") {
        throw new Error("The official local provider installation is not ready");
    }
    const selected = new Map(state.selected.map((item) => [item.contractId, item]));
    for (const contract of installation.contracts.filter(
        (item) => item.contractId.startsWith("ulvia.cms.") && item.status === "ready",
    )) {
        const current = selected.get(contract.contractId);
        if (
            current?.installationId === installation.id &&
            current.version === contract.version &&
            current.digest === contract.digest
        ) {
            continue;
        }
        await options.management.selectContract({
            installationId: installation.id,
            contractId: contract.contractId,
            version: contract.version,
            digest: contract.digest,
        });
    }

    const snapshot = await options.collections.snapshot("default");
    const installedCollection = snapshot.collections.find(({ collectionId }) => collectionId === CONTROL_COLLECTION_ID);
    const collectionEntry = (await collectionSource.list()).find(
        (entry) =>
            entry.publisherId === PROVIDER_ID &&
            entry.collectionId === CONTROL_COLLECTION_ID &&
            entry.version === CONTROL_COLLECTION_VERSION,
    );
    if (!collectionEntry) {
        throw new Error("The bundled official Control collection is unavailable from the bootstrap repository");
    }
    const bundle = await collectionSource.get(collectionEntry);
    const imported = await options.collections.importRelease(bundle.release, bundle.assets);
    if (imported.digest !== collectionEntry.digest) {
        throw new Error("The official Control collection digest changed during bootstrap");
    }
    if (installedCollection?.digest === imported.digest) {
        return;
    }
    if (installedCollection) {
        await options.collections.upgrade("default", imported.digest, snapshot.revision, collectionSource.id);
        return;
    }
    await options.collections.install("default", imported.digest, snapshot.revision, collectionSource.id);
}
