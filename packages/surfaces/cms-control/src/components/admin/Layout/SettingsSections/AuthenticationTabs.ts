import { Component } from "@bernouy/components/base";

import css from "./authentication-tabs.css" with { type: "text" };
import template from "./authentication-tabs.html" with { type: "text" };

export const AUTHENTICATION_TABS = ["methods", "policies", "sso", "sessions", "recovery"] as const;
export type AuthenticationTab = (typeof AUTHENTICATION_TABS)[number];

const DEFAULT_TAB: AuthenticationTab = "methods";

export class CmsAuthenticationTabs extends Component {
    private revealFrame?: number;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.configureLinks();
        this.syncActive();
        window.addEventListener("popstate", this.syncActive);
        window.addEventListener("resize", this.syncActive);
    }

    disconnectedCallback(): void {
        window.removeEventListener("popstate", this.syncActive);
        window.removeEventListener("resize", this.syncActive);
        if (this.revealFrame !== undefined) {
            window.cancelAnimationFrame(this.revealFrame);
            this.revealFrame = undefined;
        }
    }

    private configureLinks(): void {
        for (const link of this.links()) {
            const tab = link.dataset.authenticationTab ?? "";
            if (isAuthenticationTab(tab)) {
                link.href = authenticationTabPath(tab);
            }
        }
    }

    private syncActive = (): void => {
        const active = authenticationTabFromPath(window.location.pathname);
        let activeLink: HTMLAnchorElement | undefined;
        for (const link of this.links()) {
            if (link.dataset.authenticationTab === active) {
                link.setAttribute("aria-current", "page");
                activeLink = link;
            } else {
                link.removeAttribute("aria-current");
            }
        }
        if (activeLink) {
            this.scheduleReveal(activeLink);
        }
    };

    private scheduleReveal(link: HTMLAnchorElement): void {
        if (this.revealFrame !== undefined) {
            window.cancelAnimationFrame(this.revealFrame);
        }
        this.revealFrame = window.requestAnimationFrame(() => {
            this.revealFrame = undefined;
            if (this.isConnected) {
                this.reveal(link);
            }
        });
    }

    private reveal(link: HTMLAnchorElement): void {
        const tabs = this.shadowRoot!.querySelector<HTMLElement>(".tabs");
        if (!tabs) {
            return;
        }
        const visibleStart = tabs.scrollLeft;
        const visibleEnd = visibleStart + tabs.clientWidth;
        const linkStart = link.offsetLeft - tabs.offsetLeft;
        const linkEnd = linkStart + link.offsetWidth;
        if (linkEnd > visibleEnd) {
            tabs.scrollLeft = linkEnd - tabs.clientWidth;
        } else if (linkStart < visibleStart) {
            tabs.scrollLeft = linkStart;
        }
    }

    private links(): HTMLAnchorElement[] {
        return Array.from(this.shadowRoot!.querySelectorAll<HTMLAnchorElement>("[data-authentication-tab]"));
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
