import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

const SETTINGS_SECTIONS = [
    "general",
    "organization",
    "email",
    "privacy-analytics",
    "secrets",
    "authentication",
    "connectors",
] as const;
const DEFAULT_SECTION: SettingsSection = "general";

type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export class CmsSettingsNav extends Component {
    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.configureLinks();
        this.syncActive();
        window.addEventListener("popstate", this.syncActive);
    }

    disconnectedCallback(): void {
        window.removeEventListener("popstate", this.syncActive);
    }

    private configureLinks(): void {
        const basePath = this.basePath();
        const items = Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>("[data-settings-section]"));
        for (const item of items) {
            const section = item.dataset.settingsSection ?? "";
            if (!isSettingsSection(section)) {
                continue;
            }
            const target = section === "authentication" ? "authentication/methods" : section;
            item.setAttribute("href", `${basePath}/admin/settings/${target}`);
        }
    }

    private syncActive = (): void => {
        const active = this.activeSection();
        const items = Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>("[data-settings-section]"));
        for (const item of items) {
            item.toggleAttribute("active", item.dataset.settingsSection === active);
        }
    };

    private activeSection(): SettingsSection {
        const basePath = this.basePath();
        let path = window.location.pathname;
        if (basePath && path.startsWith(`${basePath}/`)) {
            path = path.slice(basePath.length);
        }
        path = path.replace(/^\/+|\/+$/g, "");
        if (path === "admin/settings") {
            return DEFAULT_SECTION;
        }
        const section = path.match(/^admin\/settings\/([^/]+)(?:\/|$)/)?.[1] ?? "";
        return isSettingsSection(section) ? section : DEFAULT_SECTION;
    }

    private basePath(): string {
        const meta = document.querySelector('meta[name="basePath"]');
        return (meta?.getAttribute("content") ?? "").replace(/\/+$/, "");
    }
}

if (!customElements.get("cms-settings-nav")) {
    customElements.define("cms-settings-nav", CmsSettingsNav);
}

function isSettingsSection(value: string): value is SettingsSection {
    return SETTINGS_SECTIONS.includes(value as SettingsSection);
}
