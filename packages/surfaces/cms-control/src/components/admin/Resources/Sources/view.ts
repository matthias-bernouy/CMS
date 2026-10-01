import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import { dashboardNavigationViews } from "@bernouy/cms-dashboards";
import type { Dashboard } from "../Dashboards/domain/types";
import {
    contractReleases,
    type SourceCatalogue,
    type SourceInstallations,
    sourceMetadata,
    sourceUpgrade,
    sourceUpgradeNote,
} from "./model";

export function renderSourceNavigation(
    catalogue: SourceCatalogue,
    state: SourceInstallations,
    active: string | null,
): void {
    const nav = document.querySelector("[data-source-nav]")!;
    nav.querySelector("[data-source-explore]")!.toggleAttribute("active", !active);
    nav.querySelectorAll("[data-source-item]").forEach((item) => item.remove());
    const anchor = nav.querySelector("[data-source-anchor]")!;
    for (const selected of state.selected) {
        const metadata = sourceMetadata(catalogue, selected);
        const item = document.createElement("w13c-lateral-menu-item");
        item.dataset.sourceItem = "";
        item.setAttribute("manual-active", "");
        item.setAttribute("href", sourceHref(selected.contractId));
        item.toggleAttribute("active", selected.contractId === active);
        item.setAttribute("title", selected.contractId);
        const icon = document.createElement("cms-library-icon");
        icon.slot = "icon";
        icon.setAttribute("name", metadata?.icon ?? selected.contractId.split(".")[0] ?? "folder");
        item.append(icon, metadata?.name ?? selected.contractId);
        anchor.before(item);
    }
}

export function renderSourceDetail(
    host: HTMLElement,
    contractId: string,
    catalogue: SourceCatalogue,
    state: SourceInstallations,
    allDashboards: Dashboard[],
): void {
    const selection = state.selected.find((item) => item.contractId === contractId)!;
    const installation = state.installations.find((item) => item.id === selection.installationId);
    const metadata = sourceMetadata(catalogue, selection) ?? contractReleases(catalogue, contractId)[0];
    const upgrade = sourceUpgrade(catalogue, state, selection);
    text(host, "[data-source-title]", metadata?.name ?? contractId);
    text(host, "[data-source-description]", metadata?.description ?? `Contract ${contractId}`);
    text(host, "[data-source-key]", contractId);
    text(host, "[data-source-version]", `v${selection.version}`);
    text(
        host,
        "[data-repository-version]",
        upgrade.latestRepository ? `v${upgrade.latestRepository.version}` : `v${selection.version} (latest)`,
    );
    const providerLink = host.querySelector<HTMLAnchorElement>("[data-provider-name]")!;
    providerLink.textContent = installation ? `${installation.providerId} · ${installation.accountId}` : "Unavailable";
    providerLink.href = installation
        ? `${getMetaBasePath()}/admin/settings/providers?provider=${encodeURIComponent(installation.id)}`
        : `${getMetaBasePath()}/admin/settings/providers`;
    const providerAction = host.querySelector<HTMLElement>("[data-manage-provider]")!;
    providerAction.toggleAttribute("hidden", !installation);
    providerAction.dataset.href = providerLink.href;
    text(host, "[data-provider-state]", installation ? capitalize(installation.status) : "Unavailable");
    text(
        host,
        "[data-provider-observed]",
        installation?.observedAt ? new Date(installation.observedAt).toLocaleString("en") : "Not checked",
    );
    text(
        host,
        "[data-contract-state]",
        installation?.contracts.find(
            (item) =>
                item.contractId === contractId &&
                item.version === selection.version &&
                item.digest === selection.digest,
        )?.status ?? "Unavailable",
    );
    text(
        host,
        "[data-provider-upgrade]",
        upgrade.readyRelease
            ? `v${upgrade.readyRelease.version} · ${upgrade.readyProvider!.providerId} · ${upgrade.readyProvider!.accountId}`
            : upgrade.latestRepository
              ? "Not offered by a connected provider"
              : "No upgrade required",
    );
    const upgradeButton = host.querySelector<HTMLElement>("[data-upgrade]")!;
    upgradeButton.toggleAttribute("disabled", !upgrade.readyRelease);
    upgradeButton.textContent = upgrade.readyRelease ? `Upgrade to v${upgrade.readyRelease.version}` : "Upgrade source";
    text(host, "[data-upgrade-note]", sourceUpgradeNote(selection, upgrade));
    renderDashboards(host, contractId, allDashboards);
}

function renderDashboards(host: HTMLElement, contractId: string, allDashboards: Dashboard[]): void {
    const dashboards = allDashboards.filter(
        (item) =>
            item.enabled &&
            dashboardNavigationViews(item.navigation).length > 0 &&
            item.sourceContracts?.includes(contractId),
    );
    host.querySelector("[data-source-dashboards]")!.replaceChildren(
        ...dashboards.flatMap((dashboard) => {
            const first = dashboardNavigationViews(dashboard.navigation)[0];
            if (!first) {
                return [];
            }
            const card = document.createElement("p9r-card");
            const title = document.createElement("h2");
            title.slot = "title";
            title.textContent = dashboard.name;
            const link = document.createElement("a");
            link.slot = "actions";
            link.href = `${getMetaBasePath()}/admin/dashboards/view?dashboardId=${encodeURIComponent(dashboard.id)}&viewId=${encodeURIComponent(first.use)}`;
            link.textContent = "Open dashboard";
            card.append(title, link);
            return [card];
        }),
    );
    host.querySelector("[data-no-dashboards]")!.toggleAttribute("hidden", dashboards.length > 0);
}

function sourceHref(contractId: string): string {
    return `${getMetaBasePath()}/admin/sources?source=${encodeURIComponent(contractId)}`;
}

function text(host: HTMLElement, selector: string, value: string): void {
    host.querySelector(selector)!.textContent = value;
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
