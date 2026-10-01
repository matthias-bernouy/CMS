import type { ProviderManifestLinks } from "@bernouy/cms-repository/providers";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import type { RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import type { ProviderCatalogueData, ProviderInstallation } from "./rows";

export function renderProviderDetail(
    root: ShadowRoot,
    item: ProviderInstallation | undefined,
    catalogue: ProviderCatalogueData,
): void {
    const imported = item
        ? catalogue.imported.find(
              (manifest) => manifest.id === item.providerId && manifest.version === item.manifestVersion,
          )
        : undefined;
    const manifest = item ? latestManifest(catalogue.available, item.providerId) : undefined;
    root.querySelector("[data-provider-title]")!.textContent = item
        ? (imported?.name ?? manifest?.name ?? item.providerId)
        : "Provider connection unavailable";
    root.querySelector("[data-provider-description]")!.textContent = item
        ? `${item.providerId} · ${item.accountId}`
        : "This connection is no longer available.";
    root.querySelector("[data-provider-status]")!.textContent = item ? capitalize(item.status) : "Unavailable";
    const reconnect = root.querySelector<HTMLElement>("[data-provider-reconnect]")!;
    reconnect.hidden = !item || item.status === "revoked";
    reconnect.textContent =
        item && manifest && compareSemVer(manifest.version, item.manifestVersion) > 0
            ? "Upgrade connection"
            : "Reconnect";
    const toggle = root.querySelector<HTMLElement>("[data-provider-toggle]")!;
    toggle.hidden = !item || item.status === "revoked";
    toggle.textContent = item?.status === "enabled" ? "Disable" : "Enable";
    root.querySelector<HTMLElement>("[data-provider-revoke]")!.hidden = !item || item.status === "revoked";
    const facts = root.querySelector("[data-provider-facts]")!;
    facts.replaceChildren();
    if (!item) {
        return;
    }
    for (const [label, value] of [
        ["Account", item.accountId],
        ["Manifest", `v${item.manifestVersion}`],
        ["Endpoint", item.endpoint],
        ["Last checked", item.observedAt ? new Date(item.observedAt).toLocaleString() : "Not checked"],
    ] as const) {
        const line = document.createElement("div");
        const heading = document.createElement("dt");
        heading.textContent = label;
        const detail = document.createElement("dd");
        detail.textContent = value;
        line.append(heading, detail);
        facts.append(line);
    }
    root.querySelector("[data-provider-contracts]")!.replaceChildren(
        ...item.contracts.map((contract) => {
            const line = document.createElement("div");
            line.className = "contract-row";
            const name = document.createElement("span");
            name.textContent = contract.contractId;
            const state = document.createElement("span");
            state.textContent = `v${contract.version} · ${contract.status}`;
            line.append(name, state);
            return line;
        }),
    );
    renderProviderLinks(root.querySelector("[data-provider-links]")!, imported?.links ?? manifest?.links);
}

function renderProviderLinks(container: Element, links: ProviderManifestLinks | undefined): void {
    container.replaceChildren();
    const labels: readonly [keyof ProviderManifestLinks, string][] = [
        ["setup", "Manage account or token"],
        ["documentation", "Documentation"],
        ["support", "Support"],
        ["website", "Provider website"],
    ];
    for (const [key, label] of labels) {
        if (!links?.[key]) {
            continue;
        }
        const anchor = document.createElement("a");
        anchor.href = links[key];
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = label;
        container.append(anchor);
    }
    container.toggleAttribute("hidden", container.childElementCount === 0);
}

function latestManifest(available: RepositoryArtifactEntry[], providerId: string): RepositoryArtifactEntry | undefined {
    return available
        .filter((entry) => entry.kind === "provider-manifest" && entry.id === providerId)
        .sort((a, b) => compareSemVer(b.version, a.version))[0];
}

function capitalize(value: string): string {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown";
}
