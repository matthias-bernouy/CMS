import type { CollectionRepositoryEntry } from "@bernouy/cms-repository/collections/sources";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import "../Blocs/icons/CertifiedBadge";

export type InstalledCollectionSummary = {
    collectionId: string;
    publisherId: string;
    repositoryId?: string;
    digest: string;
    version: string;
};

export type CollectionCatalogueItem = {
    release: CollectionRepositoryEntry;
    installed?: InstalledCollectionSummary;
    state: "available" | "current" | "upgrade" | "conflict";
};

export function collectionCatalogueItems(
    releases: CollectionRepositoryEntry[],
    installed: InstalledCollectionSummary[],
    query = "",
): CollectionCatalogueItem[] {
    const latest = new Map<string, CollectionRepositoryEntry>();
    for (const release of releases) {
        const key = `${release.publisherId}/${release.collectionId}`;
        const previous = latest.get(key);
        if (!previous || compareSemVer(release.version, previous.version) > 0) {
            latest.set(key, release);
        }
    }
    return [...latest.values()]
        .filter((release) =>
            [release.name, release.description, release.publisherId, release.collectionId].some((value) =>
                value.toLowerCase().includes(query),
            ),
        )
        .map((release) =>
            classify(
                release,
                installed.find((item) => item.collectionId === release.collectionId),
            ),
        )
        .sort((a, b) => a.release.name.localeCompare(b.release.name));
}

export function renderCollectionCatalogue(
    host: Element,
    items: CollectionCatalogueItem[],
    install: (release: CollectionRepositoryEntry, button: HTMLButtonElement) => void,
): void {
    host.replaceChildren(...items.map((item) => collectionCard(item, install)));
}

function classify(release: CollectionRepositoryEntry, installed?: InstalledCollectionSummary): CollectionCatalogueItem {
    if (!installed) {
        return { release, state: "available" };
    }
    if (installed.publisherId !== release.publisherId) {
        return { release, installed, state: "conflict" };
    }
    return {
        release,
        installed,
        state: compareSemVer(release.version, installed.version) > 0 ? "upgrade" : "current",
    };
}

function collectionCard(
    item: CollectionCatalogueItem,
    install: (release: CollectionRepositoryEntry, button: HTMLButtonElement) => void,
): HTMLElement {
    const card = document.createElement("article");
    card.className = "collection-card";
    const heading = document.createElement("div");
    heading.className = "collection-heading";
    const icon = document.createElement("cms-library-icon");
    icon.setAttribute("name", "grid");
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.release.name;
    const publisher = document.createElement("p");
    const publisherName = document.createElement("span");
    publisherName.textContent = `By ${item.release.publisherId === "ulvia.official" ? "Ulvia" : item.release.publisherId}`;
    publisher.append(publisherName);
    if (item.release.publisherId === "ulvia.official") {
        const badge = document.createElement("cms-certified-badge");
        badge.setAttribute("label", "Certified official Ulvia collection");
        publisher.append(badge);
    }
    copy.append(title, publisher);
    heading.append(icon, copy, stateBadge(item.state));
    const description = document.createElement("p");
    description.className = "collection-description";
    description.textContent = item.release.description;
    const capabilities = document.createElement("div");
    capabilities.className = "collection-capabilities";
    capabilities.append(chip(`${item.release.blocCount} blocs`));
    if (item.release.hasTheme) {
        capabilities.append(chip("Theme"));
    }
    if (item.release.dashboards?.length) {
        capabilities.append(
            chip(`${item.release.dashboards.length} dashboard${item.release.dashboards.length === 1 ? "" : "s"}`),
        );
    }
    const footer = document.createElement("div");
    footer.className = "collection-footer";
    const version = document.createElement("span");
    version.textContent = item.installed
        ? `Installed ${item.installed.version} · Latest ${item.release.version}`
        : `Latest ${item.release.version}`;
    const actions = document.createElement("div");
    actions.className = "collection-actions";
    if (item.installed && item.state !== "conflict") {
        const manage = document.createElement("a");
        manage.href = `${getMetaBasePath()}/admin/collections/${encodeURIComponent(`installed:${item.release.collectionId}`)}/overview`;
        manage.textContent = "Manage";
        actions.append(manage);
    }
    if (item.state === "available" || item.state === "upgrade") {
        const action = document.createElement("button");
        action.type = "button";
        action.textContent = item.state === "upgrade" ? "Upgrade" : "Install collection";
        action.addEventListener("click", () => install(item.release, action));
        actions.append(action);
    }
    footer.append(version, actions);
    card.append(heading, description, capabilities, footer);
    return card;
}

function stateBadge(state: CollectionCatalogueItem["state"]): HTMLElement {
    const badge = document.createElement("span");
    badge.className = `collection-state collection-state-${state}`;
    badge.textContent = {
        available: "Available",
        current: "Up to date",
        upgrade: "Update available",
        conflict: "ID conflict",
    }[state];
    return badge;
}

function chip(label: string): HTMLElement {
    const element = document.createElement("span");
    element.className = "collection-chip";
    element.textContent = label;
    return element;
}
