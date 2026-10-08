import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type ImageReference = {
    url?: string;
    variants?: { url: string; width: number; mimeType?: string; profile?: string }[];
};

export class Bloc extends Component {
    static get observedAttributes(): string[] {
        return ["alt", "decorative", "fetchpriority", "file", "loading", "position", "profile", "sizes", "src"];
    }

    private observer = new MutationObserver(() => this.sync());

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.observer.observe(this, { childList: true });
        this.sync();
    }

    disconnectedCallback(): void {
        this.observer.disconnect();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private sync(): void {
        const image = this.querySelector<HTMLImageElement>(":scope > img");
        if (!image) {
            return;
        }
        const reference = this.reference();
        const source = reference?.url || this.getAttribute("src");
        if (source) {
            image.src = source;
        } else {
            image.removeAttribute("src");
        }
        image.alt = this.hasAttribute("decorative") ? "" : this.getAttribute("alt") || image.alt;
        image.decoding = "async";
        image.toggleAttribute("aria-hidden", this.hasAttribute("decorative"));
        if (this.hasAttribute("decorative")) {
            image.setAttribute("role", "presentation");
        } else {
            image.removeAttribute("role");
        }
        image.loading = this.getAttribute("loading") === "eager" ? "eager" : "lazy";
        image.fetchPriority = this.getAttribute("fetchpriority") === "high" ? "high" : "auto";
        image.sizes = this.getAttribute("sizes") || "100vw";
        const sourceSet =
            reference?.variants
                ?.filter(
                    (variant) =>
                        variant.width > 0 &&
                        variant.url &&
                        (!variant.profile || variant.profile === (this.getAttribute("profile") || "responsive")),
                )
                .slice(0, 10)
                .map((variant) => variant.url + " " + variant.width + "w")
                .join(", ") || "";
        if (sourceSet) {
            image.srcset = sourceSet;
        } else {
            image.removeAttribute("srcset");
        }
        this.style.setProperty("--ulvia-official-image-position", this.getAttribute("position") || "center");
    }

    private reference(): ImageReference | null {
        const value = this.getAttribute("file");
        if (!value) {
            return null;
        }
        try {
            const parsed = JSON.parse(value) as ImageReference;
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch {
            return null;
        }
    }
}
