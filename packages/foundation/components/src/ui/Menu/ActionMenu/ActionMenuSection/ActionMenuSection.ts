import { Component, upgradeProperty } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class ActionMenuSection extends Component {
    private _label: HTMLElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._label = this.shadowRoot?.querySelector("[data-label]") ?? null;
    }

    static get observedAttributes(): string[] {
        return ["label"];
    }

    override connectedCallback(): void {
        upgradeProperty(this, "label");
        this.sync();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    get label(): string {
        return this.getAttribute("label") ?? "";
    }
    set label(value: string) {
        value ? this.setAttribute("label", value) : this.removeAttribute("label");
    }

    private sync(): void {
        if (!this._label) {
            return;
        }
        this._label.textContent = this.label;
        this._label.hidden = !this.label;
    }
}
