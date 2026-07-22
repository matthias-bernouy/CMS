import template from "./template.html" with { type: "text" };
import controlsCss from "./styles/controls.css" with { type: "text" };
import layoutCss from "./styles/layout.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class CropSystem extends Component {
    constructor() {
        super({
            css: [layoutCss, controlsCss].join("\n"),
            template: template as unknown as string,
        });
    }

    override connectedCallback() {
        const backdrop = this.shadowRoot!.getElementById("backdrop")!;
        const closeBtn = this.shadowRoot!.getElementById("close-btn")!;
        const cancelBtn = this.shadowRoot!.getElementById("btn-cancel")!;
        const applyBtn = this.shadowRoot!.getElementById("btn-apply")!;

        closeBtn.addEventListener("click", () => this.close());
        cancelBtn.addEventListener("click", () => this.close());

        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) {
                this.close();
            }
        });

        applyBtn.addEventListener("click", () => {
            this.dispatchEvent(new CustomEvent("crop", { detail: {} }));
            this.close();
        });

        const ratioButtons = this.shadowRoot!.querySelectorAll(".ratio-btn");
        ratioButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                ratioButtons.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
            });
        });
    }

    open() {
        this.setAttribute("open", "");
    }

    close() {
        this.removeAttribute("open");
        this.dispatchEvent(new CustomEvent("close"));
    }
}

customElements.define("p9r-crop-system", CropSystem);
