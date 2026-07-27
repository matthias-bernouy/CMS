import { SiteBlocBuilderController } from "./Controller/SiteBlocBuilderController";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class SiteBlocBuilder extends HTMLElement {
    private readonly controller: SiteBlocBuilderController;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        this.controller = new SiteBlocBuilderController(this, root);
    }

    connectedCallback(): void {
        this.controller.connect();
    }

    disconnectedCallback(): void {
        this.controller.disconnect();
    }
}

if (!customElements.get("cms-site-bloc-builder")) {
    customElements.define("cms-site-bloc-builder", SiteBlocBuilder);
}
