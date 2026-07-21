import type { TopBar } from "../../TopBar/TopBar";

export type ShellChromeDefaults = {
    backHref: string;
    backLabel: string;
    settingsLabel: string;
    settingsTitle: string;
    settingsDescription: string;
    pathLabel: string;
    tagsLabel: string;
    statusLabel: string;
    descriptionLabel: string;
};

export function shellResourceChromeDefaults(resource: string): ShellChromeDefaults {
    if (resource === "template") {
        return chromeDefaults(
            "Templates",
            "/admin/templates",
            "Template settings",
            "Configure template metadata.",
            "Identifier",
            "Category",
            "Status",
            "Description",
        );
    }
    return chromeDefaults(
        "Pages",
        "/admin/pages",
        "Page settings",
        "Configure page-level metadata and routing.",
        "Path",
        "Tags",
        "Status",
        "SEO description",
    );
}

export function applyShellChromeLabels(
    host: HTMLElement,
    topBar: TopBar,
    resource: string,
    defaults: ShellChromeDefaults,
    pageField: <T extends HTMLElement>(name: string) => T,
): void {
    topBar.setNavigation({
        backHref: host.getAttribute("back-href") ?? defaults.backHref,
        backLabel: host.getAttribute("back-label") ?? defaults.backLabel,
        settingsLabel: host.getAttribute("settings-label") ?? defaults.settingsLabel,
    });

    host.shadowRoot!.querySelector("#page-settings-title")!.textContent =
        host.getAttribute("settings-title") ?? defaults.settingsTitle;
    host.shadowRoot!.querySelector(".settings-description")!.textContent =
        host.getAttribute("settings-description") ?? defaults.settingsDescription;
    host.shadowRoot!.querySelector('[data-page-label="path"]')!.textContent =
        host.getAttribute("settings-path-label") ?? defaults.pathLabel;
    host.shadowRoot!.querySelector('[data-page-label="tags"]')!.textContent =
        host.getAttribute("settings-tags-label") ?? defaults.tagsLabel;
    host.shadowRoot!.querySelector('[data-page-label="published"]')!.textContent =
        host.getAttribute("settings-status-label") ?? defaults.statusLabel;
    host.shadowRoot!.querySelector('[data-page-label="description"]')!.textContent =
        host.getAttribute("settings-description-label") ?? defaults.descriptionLabel;

    const isPage = resource === "page";
    pageField<HTMLInputElement>("path").disabled = !isPage;
    pageField<HTMLSelectElement>("published").closest("label")!.hidden = !isPage;
}

function chromeDefaults(
    backLabel: string,
    backHref: string,
    settingsTitle: string,
    settingsDescription: string,
    pathLabel: string,
    tagsLabel: string,
    statusLabel: string,
    descriptionLabel: string,
): ShellChromeDefaults {
    return {
        backHref,
        backLabel,
        settingsLabel: settingsTitle,
        settingsTitle,
        settingsDescription,
        pathLabel,
        tagsLabel,
        statusLabel,
        descriptionLabel,
    };
}
