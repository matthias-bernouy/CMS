import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import type { RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import type { ProviderManifestLinks } from "@bernouy/cms-repository/providers";

export type ImportedProvider = {
    kind: string;
    id: string;
    version: string;
    digest: string;
    defaultOrigin?: string;
    publisherId?: string;
    name?: string;
    links?: ProviderManifestLinks;
};

export type ProviderCatalogueData = {
    repositories: string[];
    available: RepositoryArtifactEntry[];
    imported: ImportedProvider[];
};

export type ProviderInstallation = {
    id: string;
    providerId: string;
    accountId: string;
    endpoint: string;
    status: string;
    manifestVersion: string;
    revision: number;
    observedAt: string | null;
    contracts: { contractId: string; version: string; status: string }[];
};

export function renderProviderConnections(
    list: Element,
    installations: ProviderInstallation[],
    available: RepositoryArtifactEntry[],
): void {
    list.replaceChildren(
        ...installations.map((installation) => {
            const manifest = latestManifest(available, installation.providerId);
            return providerNavigationRow({
                title: manifest?.name ?? installation.providerId,
                description: `${installation.accountId} · ${installation.endpoint}`,
                badge: capitalize(installation.status),
                href: `${location.pathname}?provider=${encodeURIComponent(installation.id)}`,
            });
        }),
    );
}

export function renderProviderManifests(
    list: Element,
    catalogue: ProviderCatalogueData,
    installations: ProviderInstallation[],
    onSelect: (entry: RepositoryArtifactEntry, imported: ImportedProvider | undefined, row: HTMLElement) => void,
): number {
    const groups = new Map<string, RepositoryArtifactEntry[]>();
    for (const entry of catalogue.available.filter((item) => item.kind === "provider-manifest")) {
        if (installations.some((installation) => installation.providerId === entry.id)) {
            continue;
        }
        groups.set(entry.id, [...(groups.get(entry.id) ?? []), entry]);
    }
    list.replaceChildren(
        ...[...groups]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, versions]) => {
                const entry = [...versions].sort((a, b) => compareSemVer(b.version, a.version))[0]!;
                const imported = catalogue.imported.find(
                    (item) =>
                        item.kind === entry.kind &&
                        item.id === entry.id &&
                        item.version === entry.version &&
                        item.digest === entry.digest,
                );
                const row = providerNavigationRow({
                    title: entry.name,
                    description:
                        entry.description || `${entry.publisherId} · v${entry.version} · ${entry.repositoryId}`,
                    badge: imported ? "Connect" : "Import",
                });
                row.addEventListener("click", () => onSelect(entry, imported, row));
                return row;
            }),
    );
    return groups.size;
}

export function providerNavigationRow(options: {
    title: string;
    description: string;
    badge: string;
    href?: string;
}): HTMLElement {
    const row = document.createElement("p9r-navigation-list-item");
    if (options.href) {
        row.setAttribute("href", options.href);
    }
    const title = document.createElement("span");
    title.slot = "title";
    title.textContent = options.title;
    const description = document.createElement("span");
    description.slot = "description";
    description.textContent = options.description;
    const badge = document.createElement("span");
    badge.slot = "badge";
    badge.textContent = options.badge;
    row.append(providerIcon(), title, description, badge);
    return row;
}

function providerIcon(): SVGElement {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("slot", "icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.7");
    icon.innerHTML =
        '<circle cx="6" cy="12" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="m8 11 8-4M8 13l8 4"/>';
    return icon;
}

function latestManifest(available: RepositoryArtifactEntry[], providerId: string): RepositoryArtifactEntry | undefined {
    return available
        .filter((entry) => entry.kind === "provider-manifest" && entry.id === providerId)
        .sort((a, b) => compareSemVer(b.version, a.version))[0];
}

function capitalize(value: string): string {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown";
}
