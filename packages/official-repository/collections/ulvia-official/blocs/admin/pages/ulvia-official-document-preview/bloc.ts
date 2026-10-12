import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    static get observedAttributes(): string[] {
        return ["document"];
    }

    private readonly frame: HTMLIFrameElement;

    constructor() {
        super({ css, template });
        this.frame = document.createElement("iframe");
        this.frame.setAttribute("part", "frame");
        this.frame.setAttribute("sandbox", "");
        this.frame.title = "Page document preview";
        const preview = this.shadowRoot?.querySelector<HTMLElement>('[part="preview"]');
        if (!preview) {
            throw new Error("Missing document preview surface.");
        }
        preview.setAttribute("aria-label", "Page document preview");
        preview.append(this.frame);
        this.sync();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private sync(): void {
        this.frame.srcdoc = this.getAttribute("document") ?? "";
    }
}
