import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.addEventListener("accordion-item-open", this._onItemOpen as EventListener);
    }

    disconnectedCallback(): void {
        this.removeEventListener("accordion-item-open", this._onItemOpen as EventListener);
    }

    private _onItemOpen = (e: Event) => {
        if (this.getAttribute("mode") === "multi") {
            return;
        }
        const opened = e.target as HTMLElement;
        for (const item of Array.from(this.querySelectorAll(":scope > [open]"))) {
            if (item !== opened) {
                item.removeAttribute("open");
            }
        }
    };
}
