import { Component } from "@bernouy/components/base";

import template from './template.html' with { type: 'text' };

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

    constructor(){
        super({
            css: '',
            template: template as unknown as string
        })
    }

    override connectedCallback() {
        super.connectedCallback();
        const root = this.shadowRoot;
        if (!root) return;

        const basePath = this._basePath();

        this._syncRoutes(root, basePath);
        this._setBrandName(root, DEFAULT_BRAND_NAME);
        void this._syncSiteName(root, basePath);

        document.addEventListener("settings:saved", this._onSettingsSaved);
    }

    disconnectedCallback() {
        this._brandRequest?.abort();
        this._brandRequest = null;
        document.removeEventListener("settings:saved", this._onSettingsSaved);
    }

    private _basePath(): string {
        const meta = document.querySelector('meta[name="basePath"]');
        return (meta?.getAttribute('content') ?? '').replace(/\/+$/, '');
    }

    private _syncRoutes(root: ShadowRoot, basePath: string): void {
        const items = Array.from(root.querySelectorAll<HTMLElement>('[data-route]'));
        for (const item of items) {
            const route = item.dataset.route ?? '';
            if (!route) continue;
            item.setAttribute('href', `${basePath}/admin/${route}`);
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
            if (!response.ok) return;

            const data = await response.json() as SiteSettingsResponse;
            const name = typeof data.site?.name === "string" ? data.site.name.trim() : "";
            this._setBrandName(root, name || DEFAULT_BRAND_NAME);
        } catch (error) {
            if (!isAbortError(error)) return;
        } finally {
            if (this._brandRequest === request) this._brandRequest = null;
        }
    }

    private _setBrandName(root: ShadowRoot, name: string): void {
        const brandName = name.trim() || DEFAULT_BRAND_NAME;
        const label = root.querySelector<HTMLElement>("[data-admin-brand]");
        const menu = root.querySelector<HTMLElement>("w13c-lateral-menu");
        const mark = Array.from(brandName)[0]?.toUpperCase() ?? "C";

        if (label) label.textContent = brandName;
        menu?.style.setProperty("--menu-brand-mark", JSON.stringify(mark));
    }

    private _onSettingsSaved = (): void => {
        const root = this.shadowRoot;
        if (!root) return;
        void this._syncSiteName(root, this._basePath());
    };
}

customElements.define("w13c-fixed-admin-layout", FixedAdminLayout);

function isAbortError(error: unknown): boolean {
    return typeof error === "object"
        && error !== null
        && "name" in error
        && error.name === "AbortError";
}
