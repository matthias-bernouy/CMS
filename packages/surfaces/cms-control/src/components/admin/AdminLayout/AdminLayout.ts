import { Component } from "@bernouy/components/base";

import template from './template.html' with { type: 'text' };

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

        const meta     = document.querySelector('meta[name="basePath"]');
        const basePath = (meta?.getAttribute('content') ?? '').replace(/\/+$/, '');

        const items = Array.from(root.querySelectorAll<HTMLElement>('[data-route]'));
        for (const item of items) {
            const route = item.dataset.route ?? '';
            if (!route) continue;
            item.setAttribute('href', `${basePath}/admin/${route}`);
        }
    }
}

customElements.define("w13c-fixed-admin-layout", FixedAdminLayout);
