import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const input = this.shadowRoot!.querySelector("input") as HTMLInputElement;
        input.addEventListener("change", this._onChange);
        this._sync();
    }

    disconnectedCallback(): void {
        const input = this.shadowRoot!.querySelector("input") as HTMLInputElement;
        input?.removeEventListener("change", this._onChange);
    }

    private _onChange = (e: Event) => {
        const checked = (e.target as HTMLInputElement).checked;
        this.toggleAttribute("checked", checked);
        this.dispatchEvent(
            new CustomEvent("change", {
                bubbles: true,
                detail: { checked, value: this.getAttribute("value") ?? "" },
            }),
        );
    };

    private _sync() {
        const input = this.shadowRoot!.querySelector("input") as HTMLInputElement;
        input.checked = this.hasAttribute("checked");
    }
}
