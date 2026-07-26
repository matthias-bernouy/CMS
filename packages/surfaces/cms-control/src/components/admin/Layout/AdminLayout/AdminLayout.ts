import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import { discoverRepositoryNavigation } from "./repositoryNavigation";

const DEFAULT_BRAND_NAME = "CmsCore";

type SiteSettingsResponse = {
    site?: {
        name?: unknown;
    };
};

/**
 * Fixed admin shell + sidebar. Sidebar items declare their target as
 * `data-route="pages"` rather than `href="./pages"` — the relative-href
 * shape would resolve correctly from `/admin/data` but silently break
 * from any deeper page (`./pages` from `/admin/data/provider` lands on
 * `/admin/data/pages`).
 *
 * `connectedCallback` reads `<meta name="basePath">` (injected by the
 * static page template) and rewrites every `[data-route]` element to
 * carry the absolute href `<basePath>/admin/<route>`. Future nested
 * admin pages get a working sidebar for free, and the template no
 * longer carries misleading "./" hrefs.
 */
export class FixedAdminLayout extends Component {
    private _brandRequest: AbortController | null = null;
    private _repositoryRequest: AbortController | null = null;
    private _titleSlot: HTMLSlotElement | null = null;
    private _actionSlot: HTMLSlotElement | null = null;
    private _pageHeader: HTMLElement | null = null;

    constructor() {
        super({
            css: "",
            template: template as unknown as string,
        });
    }

    override connectedCallback() {
        super.connectedCallback();
        const root = this.shadowRoot;
        if (!root) {
            return;
        }

        const basePath = this._basePath();
        this._titleSlot = root.querySelector('slot[name="title"]');
        this._actionSlot = root.querySelector('slot[name="action"]');
        this._pageHeader = root.querySelector(".admin-page-header");

        this._syncRoutes(root, basePath);
        this._repositoryRequest?.abort();
        this._repositoryRequest = discoverRepositoryNavigation(root, basePath);
        this._setBrandName(root, DEFAULT_BRAND_NAME);
        this._syncPageHeader();
        void this._syncSiteName(root, basePath);

        document.addEventListener("settings:saved", this._onSettingsSaved);
        this._titleSlot?.addEventListener("slotchange", this._onPageHeaderSlotChange);
        this._actionSlot?.addEventListener("slotchange", this._onPageHeaderSlotChange);
    }

    disconnectedCallback() {
        this._brandRequest?.abort();
        this._brandRequest = null;
        this._repositoryRequest?.abort();
        this._repositoryRequest = null;
        document.removeEventListener("settings:saved", this._onSettingsSaved);
        this._titleSlot?.removeEventListener("slotchange", this._onPageHeaderSlotChange);
        this._actionSlot?.removeEventListener("slotchange", this._onPageHeaderSlotChange);
    }

    private _basePath(): string {
        const meta = document.querySelector('meta[name="basePath"]');
        return (meta?.getAttribute("content") ?? "").replace(/\/+$/, "");
    }

    private _syncRoutes(root: ShadowRoot, basePath: string): void {
        const items = Array.from(root.querySelectorAll<HTMLElement>("[data-route]"));
        for (const item of items) {
            const route = item.dataset.route ?? "";
            if (!route) {
                continue;
            }
            item.setAttribute("href", `${basePath}/admin/${route}`);
        }
    }

    private async _syncSiteName(root: ShadowRoot, basePath: string): Promise<void> {
        this._brandRequest?.abort();

        const request = new AbortController();
        this._brandRequest = request;

        try {
            const response = await fetch(`${basePath}/api/system/settings`, {
                headers: { Accept: "application/json" },
                signal: request.signal,
            });
            if (!response.ok) {
                return;
            }

            const data = (await response.json()) as SiteSettingsResponse;
            const name = typeof data.site?.name === "string" ? data.site.name.trim() : "";
            this._setBrandName(root, name || DEFAULT_BRAND_NAME);
        } catch (error) {
            if (!isAbortError(error)) {
                return;
            }
        } finally {
            if (this._brandRequest === request) {
                this._brandRequest = null;
            }
        }
    }

    private _setBrandName(root: ShadowRoot, name: string): void {
        const brandName = name.trim() || DEFAULT_BRAND_NAME;
        const label = root.querySelector<HTMLElement>("[data-admin-brand]");
        const menu = root.querySelector<HTMLElement>("w13c-lateral-menu");
        const mark = Array.from(brandName)[0]?.toUpperCase() ?? "C";

        if (label) {
            label.textContent = brandName;
        }
        menu?.style.setProperty("--menu-brand-mark", JSON.stringify(mark));
    }

    private _syncPageHeader(): void {
        if (!this._pageHeader) {
            return;
        }
        const hasTitle = this._slotHasVisibleContent(this._titleSlot);
        const hasAction = this._slotHasVisibleContent(this._actionSlot);
        const visible = hasTitle || hasAction;
        this._pageHeader.hidden = !visible;
        this._pageHeader.style.display = visible ? "flex" : "none";
        this._pageHeader.style.marginBottom = visible ? "2rem" : "0";
    }

    private _slotHasVisibleContent(slot: HTMLSlotElement | null): boolean {
        return !!slot?.assignedNodes({ flatten: true }).some((node) => {
            if (node instanceof HTMLElement) {
                return !node.hidden && node.textContent?.trim() !== "";
            }
            return node.textContent?.trim() !== "";
        });
    }

    private _onSettingsSaved = (): void => {
        const root = this.shadowRoot;
        if (!root) {
            return;
        }
        void this._syncSiteName(root, this._basePath());
    };

    private _onPageHeaderSlotChange = (): void => this._syncPageHeader();
}

if (!customElements.get("w13c-fixed-admin-layout")) {
    customElements.define("w13c-fixed-admin-layout", FixedAdminLayout);
}

function isAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
