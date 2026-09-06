import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };

const paths: Record<string, string> = {
    folder: "M3 7h7l2-3h8v16H3Z",
    layers: "m12 3 10 5-10 5L2 8 12 3ZM2 12l10 5 10-5M2 16l10 5 10-5",
    grid: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
    layout: "M3 3h18v18H3ZM3 9h18M9 9v12",
    star: "m12 3 3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1Z",
    code: "m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18",
    compass: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM15.5 8.5l-2 5-5 2 2-5 5-2Z",
};

export class LibraryIcon extends Component {
    constructor() {
        super({ css, template: '<svg viewBox="0 0 24 24" aria-hidden="true"><path/></svg>' });
    }
    static get observedAttributes(): string[] {
        return ["name"];
    }
    override connectedCallback(): void {
        this.attributeChangedCallback();
    }
    attributeChangedCallback(): void {
        this.shadowRoot!.querySelector("path")!.setAttribute(
            "d",
            paths[this.getAttribute("name") ?? "folder"] ?? paths.folder!,
        );
    }
}

customElements.define("cms-library-icon", LibraryIcon);
