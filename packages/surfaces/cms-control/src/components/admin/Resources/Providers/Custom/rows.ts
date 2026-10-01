import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import type { ImportedProvider, ProviderCatalogueData, ProviderInstallation } from "../rows";
import { providerNavigationRow } from "../rows";

export function renderCustomProviders(
    list: Element,
    catalogue: ProviderCatalogueData,
    installations: ProviderInstallation[],
    onSelect: (provider: ImportedProvider) => void,
): number {
    const repositoryCoordinates = new Set(
        catalogue.available
            .filter((item) => item.kind === "provider-manifest")
            .map((item) => `${item.id}\u0000${item.version}\u0000${item.digest}`),
    );
    const latest = new Map<string, ImportedProvider>();
    for (const provider of catalogue.imported) {
        if (
            provider.kind !== "provider-manifest" ||
            repositoryCoordinates.has(`${provider.id}\u0000${provider.version}\u0000${provider.digest}`) ||
            installations.some((installation) => installation.providerId === provider.id)
        ) {
            continue;
        }
        const previous = latest.get(provider.id);
        if (!previous || compareSemVer(provider.version, previous.version) > 0) {
            latest.set(provider.id, provider);
        }
    }
    list.replaceChildren(
        ...[...latest.values()]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((provider) => {
                const row = providerNavigationRow({
                    title: provider.name ?? provider.id,
                    description: `${provider.publisherId ?? provider.id} · manifest ${provider.version}`,
                    badge: "Connect",
                });
                row.addEventListener("click", () => onSelect(provider));
                return row;
            }),
    );
    return latest.size;
}
