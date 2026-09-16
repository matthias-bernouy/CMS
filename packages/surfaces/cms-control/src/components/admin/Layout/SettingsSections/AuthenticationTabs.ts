import { Component } from "@bernouy/components/base";

import template from "./authentication-tabs.html" with { type: "text" };

export const AUTHENTICATION_TABS = ["methods", "policies", "sso", "sessions", "recovery"] as const;
export type AuthenticationTab = (typeof AUTHENTICATION_TABS)[number];

const DEFAULT_TAB: AuthenticationTab = "methods";

export class CmsAuthenticationTabs extends Component {
    constructor() {
        super({ css: "", template: template as unknown as string });
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
        for (const link of this.links()) {
            const tab = link.dataset.authenticationTab ?? "";
            if (isAuthenticationTab(tab)) {
                link.setAttribute("href", authenticationTabPath(tab));
            }
        }
    }

    private syncActive = (): void => {
        const active = authenticationTabFromPath(window.location.pathname);
        for (const link of this.links()) {
            link.toggleAttribute("active", link.dataset.authenticationTab === active);
        }
    };

    private links(): HTMLElement[] {
        return Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>("[data-authentication-tab]"));
    }
}

if (!customElements.get("cms-authentication-tabs")) {
    customElements.define("cms-authentication-tabs", CmsAuthenticationTabs);
}

export function authenticationTabPath(tab: AuthenticationTab, basePath = readBasePath()): string {
    return `${basePath}/admin/settings/authentication/${tab}`;
}

export function authenticationTabFromPath(path: string, basePath = readBasePath()): AuthenticationTab {
    const relativePath = basePath && path.startsWith(`${basePath}/`) ? path.slice(basePath.length) : path;
    const tab = relativePath.match(/^\/admin\/settings\/authentication\/([^/]+)\/?$/)?.[1] ?? "";
    return isAuthenticationTab(tab) ? tab : DEFAULT_TAB;
}

function readBasePath(): string {
    const meta = document.querySelector('meta[name="basePath"]');
    return (meta?.getAttribute("content") ?? "").replace(/\/+$/, "");
}

function isAuthenticationTab(value: string): value is AuthenticationTab {
    return AUTHENTICATION_TABS.includes(value as AuthenticationTab);
}
