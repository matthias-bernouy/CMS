import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export type WizardStepState = "pending" | "active" | "complete";

/**
 * `<base-form-wizard-step>` — one full-page step inside a `<base-form-wizard>`.
 *
 * Visibility is driven entirely by the host `state` attribute, set by the
 * parent wizard: `pending` and `complete` are hidden, `active` is shown.
 * Unlike `<base-form-step>` there is no auto-progression on `change`; the
 * user moves forward by clicking a slotted CTA.
 *
 * Two slots carry the navigation:
 *   - `cta-next` — clicks bubble up as `wizard:next` and `preventDefault` is
 *     called so a slotted `<a>` doesn't navigate away.
 *   - `cta-prev` — same, as `wizard:prev`.
 *
 * The `progress-label` attribute is read by the parent to build the
 * horizontal progress header — the step itself doesn't render it.
 */
export class Bloc extends Component {
    static observedAttributes = ["state"];

    private _nextSlot: HTMLSlotElement | null = null;
    private _prevSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._nextSlot = root.querySelector('slot[name="cta-next"]');
        this._prevSlot = root.querySelector('slot[name="cta-prev"]');

        this.addEventListener("click", this._onClick);

        if (!this.hasAttribute("state")) {
            this.setAttribute("state", "pending");
        }
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this._onClick);
    }

    private _onClick = (e: MouseEvent) => {
        if (this.getAttribute("state") !== "active") {
            return;
        }
        const path = e.composedPath();
        const nextEls = this._nextSlot?.assignedElements({ flatten: true }) ?? [];
        const prevEls = this._prevSlot?.assignedElements({ flatten: true }) ?? [];
        for (const node of path) {
            if (!(node instanceof HTMLElement)) {
                continue;
            }
            if (nextEls.some((r) => r === node || r.contains(node))) {
                e.preventDefault();
                this.dispatchEvent(new CustomEvent("wizard:next", { bubbles: true, composed: true }));
                return;
            }
            if (prevEls.some((r) => r === node || r.contains(node))) {
                e.preventDefault();
                this.dispatchEvent(new CustomEvent("wizard:prev", { bubbles: true, composed: true }));
                return;
            }
        }
    };
}
