import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from "@bernouy/cms/component";

export class DetailMedia extends Component {
    constructor() {
        super({
            css: css as unknown as string,
            template: template as unknown as string
        });
    }

    override connectedCallback() {
        const backdrop = this.shadowRoot!.getElementById("backdrop")!;
        const closeBtn = this.shadowRoot!.getElementById("close-btn")!;

        closeBtn.addEventListener("click", () => this.close());

        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) this.close();
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.hasAttribute("open")) this.close();
        });
    }

    open(label?: string) {
        if (label) {
            this.shadowRoot!.getElementById("title")!.textContent = label;
        }
        this.setAttribute("open", "");
    }

    close() {
        this.removeAttribute("open");
        this.dispatchEvent(new CustomEvent("close"));
    }
}

if ( !customElements.get("p9r-detail-media") ) {
    customElements.define("p9r-detail-media", DetailMedia);
}