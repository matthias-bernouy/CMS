export class PageIndexingVariables extends HTMLElement {
    private readonly text: HTMLSpanElement;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `
            <style>
                :host { color: var(--text-muted); display: block; font-size: .875rem; line-height: 1.4; }
                :host([hidden]) { display: none; }
            </style>
            <span></span>
        `;
        this.text = root.querySelector("span")!;
    }

    set value(value: string) {
        this.text.textContent = value;
    }

    get value(): string {
        return this.text.textContent ?? "";
    }
}

if (!customElements.get("cms-page-indexing-variables")) {
    customElements.define("cms-page-indexing-variables", PageIndexingVariables);
}
