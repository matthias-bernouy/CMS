import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private root: Document | ShadowRoot | null = null;
    private list: HTMLElement | null = null;
    private resizeObserver = new ResizeObserver(() => this.queueIndicator());

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.root = this.getRootNode() as Document | ShadowRoot;
        this.list = this.querySelector<HTMLElement>("ulvia-official-option-list");
        this.root.addEventListener("change", this.handleChange);
        if (this.list) {
            this.resizeObserver.observe(this.list);
        }
        this.queueIndicator();
    }

    disconnectedCallback(): void {
        this.root?.removeEventListener("change", this.handleChange);
        this.resizeObserver.disconnect();
        this.root = null;
        this.list = null;
    }

    private handleChange = (event: Event): void => {
        if (event.target instanceof HTMLInputElement && this.contains(event.target)) {
            this.queueIndicator();
        }
    };

    private queueIndicator(): void {
        requestAnimationFrame(() => this.positionIndicator());
    }

    private positionIndicator(): void {
        if (!this.list) {
            return;
        }
        const selected = Array.from(this.querySelectorAll<HTMLElement>("ulvia-official-segment")).find(
            (segment) => segment.querySelector<HTMLInputElement>('input[type="radio"]')?.checked,
        );
        if (!selected) {
            this.list.style.setProperty("--option-list-indicator-opacity", "0");
            return;
        }
        const listRect = this.list.getBoundingClientRect();
        const selectedRect = selected.getBoundingClientRect();
        this.list.style.setProperty("--option-list-indicator-inline-start", `${selectedRect.left - listRect.left}px`);
        this.list.style.setProperty("--option-list-indicator-block-start", `${selectedRect.top - listRect.top}px`);
        this.list.style.setProperty("--option-list-indicator-width", `${selectedRect.width}px`);
        this.list.style.setProperty("--option-list-indicator-height", `${selectedRect.height}px`);
        this.list.style.setProperty("--option-list-indicator-opacity", "1");
    }
}
