import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

/** A visual frame. The preview response owns its separate, disabled binding core. */
export class BlocPreview extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    static get observedAttributes(): string[] {
        return ["src"];
    }

    attributeChangedCallback(): void {
        const frame = this.shadowRoot?.querySelector("iframe");
        const value = this.getAttribute("src");
        if (frame && value) {
            const url = new URL(value, location.href);
            if (url.origin === location.origin) {
                frame.src = url.href;
            }
        }
    }
}

customElements.define("cms-bloc-preview", BlocPreview);
