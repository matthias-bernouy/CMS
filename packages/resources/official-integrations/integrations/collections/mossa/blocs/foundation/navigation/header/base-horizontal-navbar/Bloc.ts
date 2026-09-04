import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._burger = this.shadowRoot?.querySelector(".burger-toggle") ?? null;
        this._burger?.addEventListener("click", this.onClick);
        this.addEventListener("click", this.onNavigation);
        this.updateCSS();
    }

    updateCSS() {
        this.registerCSSVariables({
            "navbar-breakpoint": this.getAttribute("navbar-breakpoint") || "500px",
        });
    }

    disconnectedCallback(): void {
        this._burger?.removeEventListener("click", this.onClick);
        this.removeEventListener("click", this.onNavigation);
        this._burger = null;
    }

    private _burger: Element | null = null;

    onClick = () => {
        this.toggleAttribute("open");
    };

    private onNavigation = (event: Event) => {
        if (event.composedPath().some((node) => node instanceof HTMLAnchorElement && node.hasAttribute("href"))) {
            this.removeAttribute("open");
        }
    };
}
