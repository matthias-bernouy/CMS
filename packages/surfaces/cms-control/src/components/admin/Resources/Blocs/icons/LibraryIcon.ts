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
    catalog: "M5 7.5 12 4l7 3.5v9L12 20l-7-3.5v-9Zm0 0 7 3.5m7-3.5L12 11m0 9v-9",
    commerce: "M5 7.5 12 4l7 3.5v9L12 20l-7-3.5v-9Zm0 0 7 3.5m7-3.5L12 11m0 9v-9",
    delivery: "M3 6h11v10H3V6Zm11 4h4l3 3v3h-7v-6ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    feedback: "M4 5h16v11H8l-4 4V5Zm4 4h8m-8 3h5",
    forms: "M4 5h16v11H8l-4 4V5Zm4 4h8m-8 3h5",
    image: "M4 5h16v14H4V5Zm3 10 3-3 3 3 2-2 3 3M15 9h.01",
    media: "M4 5h16v14H4V5Zm3 10 3-3 3 3 2-2 3 3M15 9h.01",
    payment: "M3 6h18v12H3V6Zm0 4h18M7 15h4",
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
