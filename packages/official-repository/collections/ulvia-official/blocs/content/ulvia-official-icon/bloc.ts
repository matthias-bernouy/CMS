import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

const paths: Record<string, string> = {
    alert: "M12 3 2.7 20h18.6L12 3Zm0 6v5m0 3h.01",
    check: "m5 12 4 4L19 6",
    collections: "M10 3H3v7h7V3Zm11 0h-7v7h7V3ZM10 14H3v7h7v-7Zm11 0h-7v7h7v-7Z",
    dashboard: "M3 3h18v18H3V3Zm0 6h18M9 9v12",
    health: "M3 12h4l3-7 4 14 3-7h4",
    layout: "M3 4h18v16H3V4Zm6 0v16m0-9h12",
    media: "M4 5h16v14H4V5Zm3 10 3-3 3 3 2-2 3 3M15 9h.01",
    pages: "M7 3h8l4 4v14H7V3Zm8 0v5h4M10 12h6m-6 4h6",
    profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
    search: "m21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
    settings:
        "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a8 8 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.8 3h-4l-.3 2.6a8 8 0 0 0-1.8 1L6.3 5.5l-2 3.5 2 1.6a8 8 0 0 0 0 2.1l-2 1.6 2 3.5 2.4-1.1a8 8 0 0 0 1.8 1l.3 2.6h4l.3-2.6a8 8 0 0 0 1.8-1l2.4 1.1 2-3.5-2-1.6a8 8 0 0 0 .1-.7Z",
    sources: "M8 12h8M5 6h14M5 18h14",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9",
};

export class Bloc extends Component {
    static get observedAttributes(): string[] {
        return ["name"];
    }

    private readonly path: SVGPathElement;

    constructor() {
        super({ css, template });
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        this.path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        svg.append(this.path);
        this.shadowRoot?.querySelector('[part="icon"]')?.append(svg);
        this.sync();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private sync(): void {
        this.path.setAttribute("d", paths[this.getAttribute("name") ?? "layout"] ?? paths.layout!);
    }
}
