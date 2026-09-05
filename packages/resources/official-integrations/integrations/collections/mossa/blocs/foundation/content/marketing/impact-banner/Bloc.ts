import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

const PRESENCE: Record<string, string> = {
    icon: "has-icon",
    eyebrow: "has-eyebrow",
    stats: "has-stats",
};

export class Bloc extends Component {
    private _disposers: Array<() => void> = [];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        for (const [slotName, attrName] of Object.entries(PRESENCE)) {
            const slot = root.querySelector(`slot[name="${slotName}"]`) as HTMLSlotElement | null;
            if (!slot) {
                continue;
            }
            const sync = () => this.toggleAttribute(attrName, slot.assignedElements().length > 0);
            slot.addEventListener("slotchange", sync);
            sync();
            this._disposers.push(() => slot.removeEventListener("slotchange", sync));
        }
    }

    disconnectedCallback(): void {
        for (const d of this._disposers) {
            d();
        }
        this._disposers = [];
    }
}
