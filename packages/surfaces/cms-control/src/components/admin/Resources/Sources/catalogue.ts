import {
    contractReleases,
    readyProviderCount,
    type SourceCatalogue,
    type SourceInstallations,
    sourceUpgrade,
} from "./model";
import "../Blocs/icons/CertifiedBadge";

const LEGACY_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
    catalog: ["catalog", "commerce"],
    forms: ["forms", "feedback"],
    media: ["media"],
};

const OFFICIAL_LEGACY_DESCRIPTIONS: Readonly<Record<string, string>> = {
    "catalog.items":
        "Connect a provider-owned catalog to list public items and retrieve the complete record for a selected item. Use it to power catalog pages, search experiences, and editorial dashboards without copying the provider's data into the CMS.",
    "forms.submissions":
        "Collect public form submissions through a provider and let administrators retrieve individual receipts. It supports contact, feedback, registration, and request flows while the provider remains responsible for the submitted data.",
    "media.assets":
        "Serve provider-owned public media through the CMS gateway so pages, blocs, and dashboards can reuse external assets. Access checks and CMS image delivery remain in the normal gateway flow.",
};

export function renderSourceCatalogue(
    host: Element,
    catalogue: SourceCatalogue,
    state: SourceInstallations,
    query: string,
): number {
    const contractIds = new Set(
        catalogue.available
            .filter(
                (entry) =>
                    entry.kind === "contract" &&
                    [
                        entry.name,
                        entry.id,
                        entry.publisherId,
                        entry.description ?? "",
                        ...(entry.categories ?? []),
                    ].some((value) => value.toLowerCase().includes(query)),
            )
            .map((entry) => entry.id),
    );
    host.replaceChildren(
        ...[...contractIds]
            .sort((a, b) => a.localeCompare(b))
            .map((contractId) => sourceCard(contractId, catalogue, state)),
    );
    return contractIds.size;
}

function sourceCard(contractId: string, catalogue: SourceCatalogue, state: SourceInstallations): HTMLElement {
    const releases = contractReleases(catalogue, contractId);
    const latest = releases[0]!;
    const selection = state.selected.find((item) => item.contractId === contractId);
    const providers = readyProviderCount(state, contractId, releases);
    const upgrade = sourceUpgrade(catalogue, state, selection);
    const card = document.createElement("p9r-card");
    card.setAttribute("stretch", "");

    const heading = document.createElement("div");
    heading.slot = "title";
    heading.className = "source-card-heading";
    const icon = sourceIcon(latest.icon ?? latest.categories?.[0] ?? contractId.split(".")[0] ?? "");
    const copy = document.createElement("div");
    copy.className = "source-card-heading-copy";
    const title = document.createElement("h2");
    title.textContent = latest.name;
    const publisher = document.createElement("div");
    publisher.className = "source-card-publisher";
    publisher.title = latest.publisherId;
    const publisherName = document.createElement("span");
    publisherName.textContent = `By ${latest.publisherId === "ulvia.official" ? "Ulvia" : latest.publisherId}`;
    publisher.append(publisherName);
    if (latest.publisherId === "ulvia.official") {
        const badge = document.createElement("cms-certified-badge");
        badge.setAttribute("label", "Certified official Ulvia contract");
        publisher.append(badge);
    }
    copy.append(title, publisher);
    heading.append(icon, copy);

    const description = document.createElement("p");
    description.slot = "description";
    description.textContent =
        (latest.publisherId === "ulvia.official" && latest.version === "0.1.0"
            ? OFFICIAL_LEGACY_DESCRIPTIONS[contractId]
            : undefined) ??
        latest.description ??
        `Source provided by ${latest.publisherId}.`;

    const categories = document.createElement("div");
    categories.className = "source-card-categories";
    categories.setAttribute("aria-label", "Categories");
    const legacyCategory = contractId.split(".")[0] ?? "source";
    for (const category of latest.categories?.length
        ? latest.categories
        : (LEGACY_CATEGORIES[legacyCategory] ?? [legacyCategory])) {
        const badge = document.createElement("p9r-badge");
        badge.textContent = categoryLabel(category);
        categories.append(badge);
    }

    const availability = document.createElement("p");
    availability.className = "source-card-availability";
    availability.dataset.state = selection ? "connected" : providers > 0 ? "ready" : "unavailable";
    availability.textContent = selection
        ? "Connected to this site"
        : providers > 0
          ? `${providers} compatible provider${providers === 1 ? "" : "s"} ready`
          : "A compatible provider is required";

    const action = document.createElement("p9r-button") as HTMLElement & { disabled: boolean };
    action.slot = "actions";
    action.dataset.importContract = contractId;
    action.setAttribute("type", "button");
    action.textContent = selection ? (upgrade.readyRelease ? "Upgrade available" : "Manage source") : "Connect source";
    action.disabled = !selection && providers === 0;
    if (action.disabled) {
        action.setAttribute("variant", "outlined");
        action.textContent = "Provider unavailable";
    } else {
        action.setAttribute("variant", selection ? "outlined" : "filled");
        action.setAttribute("color", "primary");
    }

    card.append(heading, description, categories, availability);
    if (latest.publishedAt) {
        const meta = document.createElement("span");
        meta.slot = "meta";
        meta.textContent = `Updated ${formatDate(latest.publishedAt)}`;
        card.append(meta);
    }
    card.append(action);
    return card;
}

function sourceIcon(name: string): HTMLElement {
    const icon = document.createElement("cms-library-icon");
    icon.classList.add("source-card-icon");
    icon.setAttribute("name", name);
    return icon;
}

function categoryLabel(category: string): string {
    return category
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function formatDate(value: string): string {
    return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
