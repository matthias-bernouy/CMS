import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import type { RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";

export type ProviderInstallation = {
    id: string;
    providerId: string;
    accountId: string;
    status: string;
    observedAt: string | null;
    contracts: { contractId: string; version: string; digest: string; status: string }[];
};

export type SourceSelection = { installationId: string; contractId: string; version: string; digest: string };
export type ImportedContract = {
    kind: string;
    id: string;
    version: string;
    digest: string;
    publisherId?: string;
    name?: string;
    description?: string;
    icon?: string;
    categories?: readonly string[];
    publishedAt?: string;
};
export type SourceCatalogue = {
    available: RepositoryArtifactEntry[];
    repositories: string[];
    imported?: ImportedContract[];
};
export type SourceInstallations = { installations: ProviderInstallation[]; selected: SourceSelection[] };

export type SourceUpgrade = {
    latestRepository?: RepositoryArtifactEntry;
    readyRelease?: RepositoryArtifactEntry;
    readyProvider?: ProviderInstallation;
};

export function contractReleases(catalogue: SourceCatalogue, contractId: string): RepositoryArtifactEntry[] {
    return catalogue.available
        .filter((entry) => entry.kind === "contract" && entry.id === contractId)
        .sort((a, b) => compareSemVer(b.version, a.version));
}

export function sourceMetadata(catalogue: SourceCatalogue, selection: SourceSelection | undefined) {
    if (!selection) {
        return undefined;
    }
    return (
        catalogue.available.find(
            (entry) =>
                entry.kind === "contract" &&
                entry.id === selection.contractId &&
                entry.version === selection.version &&
                entry.digest === selection.digest,
        ) ??
        catalogue.imported?.find(
            (entry) =>
                entry.kind === "contract" &&
                entry.id === selection.contractId &&
                entry.version === selection.version &&
                entry.digest === selection.digest,
        )
    );
}

export function sourceUpgrade(
    catalogue: SourceCatalogue,
    state: SourceInstallations,
    selection: SourceSelection | undefined,
): SourceUpgrade {
    if (!selection) {
        return {};
    }
    const newer = contractReleases(catalogue, selection.contractId).filter(
        (entry) => compareSemVer(entry.version, selection.version) > 0,
    );
    for (const release of newer) {
        const provider = state.installations.find(
            (installation) =>
                installation.status === "enabled" &&
                installation.contracts.some(
                    (contract) =>
                        contract.contractId === selection.contractId &&
                        contract.version === release.version &&
                        contract.digest === release.digest &&
                        contract.status === "ready",
                ),
        );
        if (provider) {
            return { latestRepository: newer[0], readyRelease: release, readyProvider: provider };
        }
    }
    return { latestRepository: newer[0] };
}

export function sourceUpgradeNote(selection: SourceSelection | undefined, upgrade: SourceUpgrade): string {
    if (!selection) {
        return "Connect this source from Explore sources before upgrading it.";
    }
    if (!upgrade.latestRepository) {
        return "This source uses the latest repository release.";
    }
    if (!upgrade.readyRelease) {
        return `Repository release v${upgrade.latestRepository.version} is available, but no connected provider reports it ready.`;
    }
    const provider = `${upgrade.readyProvider!.providerId} · ${upgrade.readyProvider!.accountId}`;
    if (upgrade.readyRelease.version !== upgrade.latestRepository.version) {
        return `Release v${upgrade.readyRelease.version} is ready through ${provider}. Repository release v${upgrade.latestRepository.version} is newer, but no connected provider reports it ready.`;
    }
    return `Repository release v${upgrade.readyRelease.version} is ready through ${provider}.`;
}

export function readyContractVersions(
    catalogue: SourceCatalogue,
    state: SourceInstallations,
    installationId: string,
    contractId: string,
): RepositoryArtifactEntry[] {
    const provider = state.installations.find((item) => item.id === installationId);
    const selected = state.selected.find((item) => item.contractId === contractId);
    if (provider?.status !== "enabled") {
        return [];
    }
    return contractReleases(catalogue, contractId).filter(
        (entry) =>
            (!selected || compareSemVer(entry.version, selected.version) > 0) &&
            provider.contracts.some(
                (item) =>
                    item.contractId === contractId &&
                    item.version === entry.version &&
                    item.digest === entry.digest &&
                    item.status === "ready",
            ),
    );
}

export function readyProviderCount(
    state: SourceInstallations,
    contractId: string,
    releases: RepositoryArtifactEntry[],
): number {
    return state.installations.filter(
        (provider) =>
            provider.status === "enabled" &&
            provider.contracts.some(
                (contract) =>
                    contract.contractId === contractId &&
                    contract.status === "ready" &&
                    releases.some(
                        (release) => release.version === contract.version && release.digest === contract.digest,
                    ),
            ),
    ).length;
}

export function readyProviders(
    catalogue: SourceCatalogue,
    state: SourceInstallations,
    contractId: string,
): ProviderInstallation[] {
    return state.installations.filter(
        (provider) => readyContractVersions(catalogue, state, provider.id, contractId).length > 0,
    );
}
