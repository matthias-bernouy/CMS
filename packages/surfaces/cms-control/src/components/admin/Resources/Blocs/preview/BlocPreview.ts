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

    override connectedCallback(): void {
        window.addEventListener("message", this.receiveLayout);
    }

    disconnectedCallback(): void {
        window.removeEventListener("message", this.receiveLayout);
    }

    attributeChangedCallback(): void {
        const frame = this.shadowRoot?.querySelector("iframe");
        const value = this.getAttribute("src");
        if (!frame) {
            return;
        }
        if (!value || value.includes("{{")) {
            frame.removeAttribute("src");
            return;
        }
        delete this.dataset.previewLayout;
        this.style.removeProperty("--bloc-preview-content-height");
        const url = new URL(value, location.href);
        if (url.origin === location.origin) {
            frame.src = url.href;
        } else {
            frame.removeAttribute("src");
        }
    }

    private readonly receiveLayout = (event: MessageEvent): void => {
        const frame = this.shadowRoot?.querySelector("iframe");
        if (!frame || event.source !== frame.contentWindow || !isLayoutMessage(event.data)) {
            return;
        }
        this.dataset.previewLayout = event.data.layout;
        this.style.setProperty("--bloc-preview-content-height", `${Math.max(180, event.data.height)}px`);
    };
}

function isLayoutMessage(value: unknown): value is { type: "cms:bloc-preview-layout"; layout: string; height: number } {
    const message = value as { type?: unknown; layout?: unknown; height?: unknown };
    return (
        !!value &&
        typeof value === "object" &&
        message.type === "cms:bloc-preview-layout" &&
        ["compact", "section", "page"].includes(String(message.layout)) &&
        typeof message.height === "number" &&
        Number.isFinite(message.height)
    );
}

customElements.define("cms-bloc-preview", BlocPreview);
