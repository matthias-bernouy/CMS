import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private textarea: HTMLTextAreaElement | null = null;
    private counter: HTMLElement | null;
    private slotElement: HTMLSlotElement | null;
    private root: Document | ShadowRoot | null = null;
    private observer = new MutationObserver(() => this.sync());

    constructor() {
        super({ css, template });
        this.counter = this.shadowRoot?.querySelector('[part="count"]') ?? null;
        this.slotElement = this.shadowRoot?.querySelector("slot") ?? null;
    }

    override connectedCallback(): void {
        this.slotElement?.addEventListener("slotchange", this.bindTextarea);
        this.root = this.getRootNode() as Document | ShadowRoot;
        this.root.addEventListener("reset", this.handleReset);
        this.bindTextarea();
    }

    disconnectedCallback(): void {
        this.slotElement?.removeEventListener("slotchange", this.bindTextarea);
        this.textarea?.removeEventListener("input", this.sync);
        this.root?.removeEventListener("reset", this.handleReset);
        this.root = null;
        this.observer.disconnect();
    }

    private bindTextarea = (): void => {
        this.textarea?.removeEventListener("input", this.sync);
        this.observer.disconnect();
        this.textarea = this.querySelector<HTMLTextAreaElement>(":scope > textarea");
        this.textarea?.addEventListener("input", this.sync);
        if (this.textarea) {
            this.observer.observe(this.textarea, {
                attributes: true,
                attributeFilter: ["maxlength", "disabled"],
            });
        }
        this.sync();
    };

    private sync = (): void => {
        const limit = this.textarea?.maxLength ?? -1;
        const length = this.textarea?.value.length ?? 0;
        this.toggleAttribute("data-count-ready", limit > 0);
        if (this.counter) {
            this.counter.textContent = limit > 0 ? `${length} / ${limit}` : "";
        }
    };

    private handleReset = (event: Event): void => {
        if (event.target !== this.textarea?.form) {
            return;
        }
        window.setTimeout(this.sync);
    };
}
