import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

const STEP_TAG = "base-form-wizard-step";

/**
 * `<base-form-wizard>` — full-page wizard with a horizontal progress
 * header. Coordinates a sequence of `<base-form-wizard-step>` children:
 * only the step at index `current-step` is rendered, earlier steps
 * report as `complete`, later ones as `pending`. The visual progress bar
 * is generated from the children's `progress-label` attributes.
 *
 * Navigation flows up via custom events the children dispatch when a
 * CTA inside `slot="cta-next"` / `slot="cta-prev"` is clicked
 * (`wizard:next`, `wizard:prev`). The wizard increments/decrements
 * `current-step` accordingly. A click on a `complete` progress bubble
 * jumps back to that step — unless the step opts out via
 * `allow-backtrack="no"`.
 */
export class Bloc extends Component {
    static observedAttributes = ["current-step"];

    private _slot: HTMLSlotElement | null = null;
    private _progressList: HTMLOListElement | null = null;
    private _children: HTMLElement[] = [];
    private _observer: MutationObserver | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._slot = root.querySelector("slot:not([name])");
        this._progressList = root.querySelector(".progress-list");

        this._slot?.addEventListener("slotchange", this._onSlotChange);
        this._progressList?.addEventListener("click", this._onProgressClick);
        this.addEventListener("wizard:next", this._onWizardNext as EventListener);
        this.addEventListener("wizard:prev", this._onWizardPrev as EventListener);

        this._observer = new MutationObserver(this._onChildMutation);

        this._refreshChildren();
    }

    disconnectedCallback(): void {
        this._slot?.removeEventListener("slotchange", this._onSlotChange);
        this._progressList?.removeEventListener("click", this._onProgressClick);
        this.removeEventListener("wizard:next", this._onWizardNext as EventListener);
        this.removeEventListener("wizard:prev", this._onWizardPrev as EventListener);
        this._observer?.disconnect();
        this._observer = null;
        this._children = [];
    }

    attributeChangedCallback(name: string): void {
        if (name === "current-step") {
            this._syncStepStates();
        }
    }

    // ── Slot reactions ────────────────────────────────────────────

    private _onSlotChange = () => {
        this._refreshChildren();
    };

    private _refreshChildren(): void {
        const slotted = this._slot?.assignedElements({ flatten: true }) ?? [];
        const steps = slotted.filter(
            (el): el is HTMLElement => el instanceof HTMLElement && el.tagName.toLowerCase() === STEP_TAG,
        );

        this._observer?.disconnect();
        this._children = steps;

        steps.forEach((el, i) => {
            el.setAttribute("step-number", String(i + 1));
            this._observer!.observe(el, {
                attributes: true,
                attributeFilter: ["progress-label", "allow-backtrack"],
            });
        });

        this._syncStepStates();
    }

    private _onChildMutation = () => {
        this._renderProgress();
    };

    // ── Navigation ────────────────────────────────────────────────

    private _onWizardNext = (e: Event) => {
        e.stopPropagation();
        const current = this._currentIndex();
        if (current < this._children.length) {
            this.setAttribute("current-step", String(current + 1));
        }
    };

    private _onWizardPrev = (e: Event) => {
        e.stopPropagation();
        const current = this._currentIndex();
        if (current > 1) {
            this.setAttribute("current-step", String(current - 1));
        }
    };

    private _onProgressClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        const item = target?.closest(".progress-item") as HTMLElement | null;
        if (!item) {
            return;
        }
        if (item.getAttribute("data-state") !== "complete") {
            return;
        }
        if (item.getAttribute("data-clickable") !== "yes") {
            return;
        }
        const idx = parseInt(item.getAttribute("data-step") ?? "0", 10);
        if (idx > 0) {
            this.setAttribute("current-step", String(idx));
        }
    };

    // ── State propagation to children ─────────────────────────────

    private _syncStepStates(): void {
        const current = this._currentIndex();
        this._children.forEach((step, i) => {
            const idx = i + 1;
            const state = idx < current ? "complete" : idx === current ? "active" : "pending";
            step.setAttribute("state", state);
        });
        this._renderProgress();
    }

    private _currentIndex(): number {
        const raw = parseInt(this.getAttribute("current-step") ?? "1", 10);
        if (isNaN(raw)) {
            return 1;
        }
        if (this._children.length === 0) {
            return 1;
        }
        return Math.max(1, Math.min(this._children.length, raw));
    }

    // ── Progress header rendering ─────────────────────────────────

    private _renderProgress(): void {
        if (!this._progressList) {
            return;
        }

        const current = this._currentIndex();
        const frag = document.createDocumentFragment();

        this._children.forEach((step, i) => {
            const idx = i + 1;
            const state = idx < current ? "complete" : idx === current ? "active" : "pending";
            const label = step.getAttribute("progress-label") ?? "";
            const allowBacktrack = step.getAttribute("allow-backtrack") !== "no";

            const item = document.createElement(state === "complete" && allowBacktrack ? "button" : "li");
            item.className = "progress-item";
            item.setAttribute("data-state", state);
            item.setAttribute("data-step", String(idx));
            if (state === "complete" && allowBacktrack) {
                item.setAttribute("data-clickable", "yes");
                (item as HTMLButtonElement).type = "button";
            }
            if (state === "active") {
                item.setAttribute("aria-current", "step");
            }

            const bubble = document.createElement("span");
            bubble.className = "progress-bubble";
            const num = document.createElement("span");
            num.className = "progress-number";
            num.textContent = String(idx);
            bubble.append(num);

            const labelEl = document.createElement("span");
            labelEl.className = "progress-label";
            labelEl.textContent = label;

            item.append(bubble, labelEl);
            frag.append(item);

            if (i < this._children.length - 1) {
                const connector = document.createElement("li");
                connector.className = "progress-connector";
                connector.setAttribute("aria-hidden", "true");
                frag.append(connector);
            }
        });

        this._progressList.replaceChildren(frag);
    }
}
