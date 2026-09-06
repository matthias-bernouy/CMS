import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

/** Visual fallback for library media; authored images stay slotted in light DOM. */
export class LibraryArtwork extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    static get observedAttributes(): string[] {
        return ["label"];
    }

    override connectedCallback(): void {
        this.addEventListener("error", this.imageFailed, true);
        this.addEventListener("load", this.imageLoaded, true);
        this.attributeChangedCallback();
    }

    disconnectedCallback(): void {
        this.removeEventListener("error", this.imageFailed, true);
        this.removeEventListener("load", this.imageLoaded, true);
    }

    attributeChangedCallback(): void {
        const label = this.getAttribute("label") ?? "Collection";
        this.shadowRoot!.querySelector(".name")!.textContent = label;
        this.shadowRoot!.querySelector(".monogram")!.textContent = label.slice(0, 1).toUpperCase();
    }

    private readonly imageFailed = (event: Event): void => {
        if (event.target instanceof HTMLImageElement) {
            event.target.setAttribute("data-artwork-failed", "");
        }
    };

    private readonly imageLoaded = (event: Event): void => {
        if (event.target instanceof HTMLImageElement) {
            event.target.removeAttribute("data-artwork-failed");
        }
    };
}

customElements.define("cms-library-artwork", LibraryArtwork);
