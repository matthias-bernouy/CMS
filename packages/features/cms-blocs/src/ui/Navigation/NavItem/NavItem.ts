import { Component } from "@bernouy/cms-blocs/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class NavItem extends Component {
    static observedAttributes = ["href", "target"];

    private _bound = false;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._syncLink();
        if (this._bound) return;
        const slot = this.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="items"]');
        if (!slot) return;
        const sync = () => this.toggleAttribute("has-dropdown", slot.assignedElements().length > 0);
        slot.addEventListener("slotchange", sync);
        sync();
        this._bound = true;
    }

    attributeChangedCallback(): void {
        this._syncLink();
    }

    private _syncLink(): void {
        const a = this.shadowRoot?.querySelector<HTMLAnchorElement>("a.label");
        if (!a) return;
        const href = this.getAttribute("href");
        const target = this.getAttribute("target");
        if (href) a.setAttribute("href", href);
        else a.removeAttribute("href");
        if (target && target !== "_self") a.setAttribute("target", target);
        else a.removeAttribute("target");
        if (target === "_blank") a.setAttribute("rel", "noopener noreferrer");
        else a.removeAttribute("rel");
    }
}
