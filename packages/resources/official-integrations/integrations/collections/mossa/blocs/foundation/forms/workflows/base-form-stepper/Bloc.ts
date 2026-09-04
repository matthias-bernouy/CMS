import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

const STEP_TAG = "base-form-step";

/**
 * `<base-form-stepper>` — coordinates a sequence of `<base-form-step>`
 * children. Numbers them, exposes the first as `active` on mount, and
 * walks through the state transitions:
 *
 *   - step.state === 'complete'  → next step's state becomes 'active'
 *   - step.state goes 'complete' → 'active' (user clicked Changer):
 *       if `cascade-edit` is 'yes' (default), every subsequent step
 *       resets to 'pending' so they're walked through again
 *   - all steps 'complete'       → host gets `all-complete` attribute,
 *       revealing the `final` slot (submit button)
 *
 * Form data collection is handled by the outer `<base-form>` (which
 * queries light-DOM `[name]` regardless of nesting), so this bloc is
 * purely a view-layer orchestrator.
 */
export class Bloc extends Component {
    static observedAttributes = ["cascade-edit"];

    private _slot: HTMLSlotElement | null = null;
    private _children: HTMLElement[] = [];
    private _observer: MutationObserver | null = null;
    private _prevState: Map<HTMLElement, string> = new Map();

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._slot = this.shadowRoot!.querySelector("slot:not([name])");
        this._slot?.addEventListener("slotchange", this._onSlotChange);
        this._observer = new MutationObserver(this._onStateMutation);
        this._refreshChildren();
    }

    disconnectedCallback(): void {
        this._slot?.removeEventListener("slotchange", this._onSlotChange);
        this._observer?.disconnect();
        this._observer = null;
        this._children = [];
        this._prevState.clear();
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

        // Detach observer entries that are no longer present.
        this._observer?.disconnect();
        this._prevState.clear();

        this._children = steps;

        // (Re-)number children.
        steps.forEach((el, i) => el.setAttribute("step-number", String(i + 1)));

        // Initial state — first active, others pending — only if the
        // author hasn't explicitly set a state already.
        steps.forEach((el, i) => {
            if (!el.hasAttribute("state")) {
                el.setAttribute("state", i === 0 ? "active" : "pending");
            }
            this._prevState.set(el, el.getAttribute("state") ?? "");
        });

        if (
            steps.length > 0 &&
            !steps.some((el) => {
                const state = el.getAttribute("state");
                return state === "active" || state === "complete";
            })
        ) {
            steps[0]!.setAttribute("state", "active");
            this._prevState.set(steps[0]!, "active");
        }

        // Re-observe.
        steps.forEach((el) =>
            this._observer!.observe(el, {
                attributes: true,
                attributeFilter: ["state"],
            }),
        );

        this._syncAllComplete();
    }

    // ── State coordination ────────────────────────────────────────

    private _onStateMutation = (records: MutationRecord[]) => {
        for (const r of records) {
            const target = r.target as HTMLElement;
            const next = target.getAttribute("state") ?? "";
            const prev = this._prevState.get(target) ?? "";
            this._prevState.set(target, next);
            if (next === prev) {
                continue;
            }
            this._reactToStateChange(target, prev, next);
        }
        this._syncAllComplete();
    };

    private _reactToStateChange(step: HTMLElement, prev: string, next: string): void {
        const idx = this._children.indexOf(step);
        if (idx < 0) {
            return;
        }

        // Step just completed → activate the next pending one.
        if (next === "complete" && prev !== "complete") {
            const nextStep = this._children[idx + 1];
            if (nextStep && nextStep.getAttribute("state") === "pending") {
                nextStep.setAttribute("state", "active");
            }
        }

        // Step re-opened from complete (user clicked Changer).
        // With cascade-edit (default), every step after this one is
        // reset to pending so they're walked through again — the value
        // they captured might depend on the one being edited.
        if (prev === "complete" && next === "active") {
            const cascade = (this.getAttribute("cascade-edit") ?? "yes") !== "no";
            if (cascade) {
                for (let i = idx + 1; i < this._children.length; i++) {
                    const later = this._children[i];
                    if (!later) {
                        continue;
                    }
                    later.setAttribute("state", "pending");
                    this._prevState.set(later, "pending");
                }
            }
        }
    }

    private _syncAllComplete(): void {
        const all = this._children.length > 0 && this._children.every((el) => el.getAttribute("state") === "complete");
        this.toggleAttribute("all-complete", all);
    }
}
