import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

const OPTIONAL_REGIONS = ["breadcrumb", "actions", "description", "navigation", "footer"] as const;

export class Bloc extends Component {
    private readonly slots: HTMLSlotElement[];

    constructor() {
        super({ css, template });
        this.slots = Array.from(this.shadowRoot?.querySelectorAll("slot") ?? []);
    }

    override connectedCallback(): void {
        for (const slot of this.slots) {
            slot.addEventListener("slotchange", this.sync);
        }
        this.sync();
    }

    disconnectedCallback(): void {
        for (const slot of this.slots) {
            slot.removeEventListener("slotchange", this.sync);
        }
    }

    private readonly sync = (): void => {
        for (const name of OPTIONAL_REGIONS) {
            const slot = this.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="' + name + '"]');
            const region = this.shadowRoot?.querySelector<HTMLElement>('[part="' + name + '"]');
            if (region) {
                region.hidden = !slot?.assignedNodes({ flatten: true }).some(hasMeaningfulContent);
            }
        }
    };
}

function hasMeaningfulContent(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
        return Boolean(node.textContent?.trim());
    }
    if (!(node instanceof Element)) {
        return false;
    }
    if (node instanceof HTMLSlotElement) {
        return node.assignedNodes({ flatten: true }).some(hasMeaningfulContent);
    }
    if (node.localName.includes("-") || node.matches("a, button, input, select, textarea, img, svg, video, audio")) {
        return true;
    }
    return Array.from(node.childNodes).some(hasMeaningfulContent);
}
