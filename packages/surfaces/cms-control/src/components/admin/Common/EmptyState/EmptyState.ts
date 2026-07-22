import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export type EmptyStateOptions = {
    icon?: string;
    title: string;
    hint?: string;
};

export class EmptyState extends Component {
    constructor() {
        super({
            css: css as unknown as string,
            template: template as unknown as string,
        });
    }

    /**
     * Programmatic builder for flow contexts (grids, panels) — the element is
     * created in `fluid` mode (normal flow, auto height) as opposed to the
     * declarative table-row usage in the admin pages.
     */
    static create(opts: EmptyStateOptions): EmptyState {
        const el = document.createElement("cms-empty-state") as EmptyState;
        el.setAttribute("fluid", "");

        if (opts.icon) {
            const fragment = document.createRange().createContextualFragment(opts.icon);
            const iconRoot = fragment.firstElementChild;
            if (iconRoot) {
                iconRoot.setAttribute("slot", "icon");
                el.appendChild(iconRoot);
            }
        }

        const title = document.createElement("p");
        title.slot = "title";
        title.textContent = opts.title;
        el.appendChild(title);

        if (opts.hint) {
            const hint = document.createElement("p");
            hint.slot = "hint";
            hint.textContent = opts.hint;
            el.appendChild(hint);
        }

        return el;
    }
}

if (!customElements.get("cms-empty-state")) {
    customElements.define("cms-empty-state", EmptyState);
}
