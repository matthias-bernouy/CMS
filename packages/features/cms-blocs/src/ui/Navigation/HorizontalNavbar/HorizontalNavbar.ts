import { Component } from "@bernouy/cms-blocs/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class HorizontalNavbar extends Component {
    private _bound = false;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        if (this._bound) return;
        const nav = this.shadowRoot!.querySelector<HTMLElement>(".navbar");
        const burger = this.shadowRoot!.querySelector<HTMLButtonElement>(".burger");
        if (!nav || !burger) return;
        burger.addEventListener("click", () => {
            const open = nav.classList.toggle("is-open");
            burger.setAttribute("aria-expanded", String(open));
        });
        this._bound = true;
    }
}
