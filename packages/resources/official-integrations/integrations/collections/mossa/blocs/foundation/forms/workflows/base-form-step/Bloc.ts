import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export type StepState = "pending" | "active" | "complete";
export type ValidateOn = "change" | "button" | "manual";

/**
 * `<base-form-step>` — one step inside a `<base-form-stepper>`.
 *
 * Owns its visibility via the `state` host attribute (pending|active|complete).
 * Pending = hidden, active = inputs visible, complete = collapsed to summary.
 *
 * Auto-progression: when `validate-on="change"` (default) and any `[name]`
 * input inside the active slot fires a `change` event AND every collected
 * input is `:valid` (and every `[required]` has a non-empty value), the
 * step transitions to `complete`. The parent stepper observes that and
 * activates the next step.
 *
 * The "Changer" button is rendered automatically and only visible in the
 * `complete` state. Clicking it returns the step to `active`; the parent
 * stepper handles the cascade-reset of subsequent steps if configured.
 *
 * The summary content is either author-slotted (slot="summary") or, when
 * empty, auto-generated as a `<dl>` of `name → value` pairs.
 */
export class Bloc extends Component {
    static observedAttributes = ["state", "step-number"];

    private _activeSlot: HTMLSlotElement | null = null;
    private _summarySlot: HTMLSlotElement | null = null;
    private _summaryDl: HTMLElement | null = null;
    private _editBtn: HTMLButtonElement | null = null;
    private _numberSpan: HTMLElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._activeSlot = root.querySelector('slot[name="active"]');
        this._summarySlot = root.querySelector('slot[name="summary"]');
        this._summaryDl = root.querySelector(".step-auto-summary");
        this._editBtn = root.querySelector(".step-edit-btn");
        this._numberSpan = root.querySelector(".step-number > span");

        this._summarySlot?.addEventListener("slotchange", this._onSummarySlotChange);
        this._editBtn?.addEventListener("click", this._onEditClick);
        this.addEventListener("change", this._onChange);
        this.addEventListener("click", this._onValidateClick);

        if (!this.hasAttribute("state")) {
            this.setAttribute("state", "pending");
        }
        this._syncNumber();
        this._onSummarySlotChange();
    }

    disconnectedCallback(): void {
        this._summarySlot?.removeEventListener("slotchange", this._onSummarySlotChange);
        this._editBtn?.removeEventListener("click", this._onEditClick);
        this.removeEventListener("change", this._onChange);
        this.removeEventListener("click", this._onValidateClick);
    }

    attributeChangedCallback(name: string): void {
        if (name === "state" && this.getAttribute("state") === "complete") {
            this._buildAutoSummary();
        }
        if (name === "step-number") {
            this._syncNumber();
        }
    }

    // ── Slot reactions ────────────────────────────────────────────

    private _onSummarySlotChange = () => {
        const hasContent = (this._summarySlot?.assignedElements({ flatten: true }).length ?? 0) > 0;
        this.toggleAttribute("has-summary", hasContent);
    };

    // ── Auto-progression on `change` ──────────────────────────────

    private _onChange = (e: Event) => {
        if (this.getAttribute("state") !== "active") {
            return;
        }
        const mode = (this.getAttribute("validate-on") ?? "change") as ValidateOn;
        if (mode !== "change") {
            return;
        }
        if (!this._eventTargetsActiveSlot(e)) {
            return;
        }
        if (this._allValid()) {
            this.setAttribute("state", "complete");
        }
    };

    // ── Manual validation via slotted button ──────────────────────

    private _onValidateClick = (e: MouseEvent) => {
        if (this.getAttribute("state") !== "active") {
            return;
        }
        const mode = (this.getAttribute("validate-on") ?? "change") as ValidateOn;
        if (mode !== "button") {
            return;
        }
        const path = e.composedPath();
        const trigger = path.find(
            (n) => n instanceof HTMLElement && (n as HTMLElement).hasAttribute("data-step-validate"),
        );
        if (!trigger) {
            return;
        }
        if (this._allValid()) {
            this.setAttribute("state", "complete");
        }
    };

    private _eventTargetsActiveSlot(e: Event): boolean {
        const path = e.composedPath();
        const slotted = this._activeSlot?.assignedElements({ flatten: true }) ?? [];
        for (const node of path) {
            if (!(node instanceof HTMLElement)) {
                continue;
            }
            if (slotted.some((root) => root === node || root.contains(node))) {
                return true;
            }
        }
        return false;
    }

    // ── Edit button ───────────────────────────────────────────────

    private _onEditClick = () => {
        if (this.getAttribute("state") !== "complete") {
            return;
        }
        this.setAttribute("state", "active");
    };

    // ── Validation helpers ────────────────────────────────────────

    private _allValid(): boolean {
        const inputs = this._collectInputs();
        // No inputs is fine — an input-less step is typically a recap /
        // confirmation step that's validated only by the `[data-step-validate]`
        // button click. Auto-progress (`validate-on="change"`) never fires
        // for such a step since there's nothing to emit `change`.
        if (inputs.length === 0) {
            return true;
        }
        for (const el of inputs) {
            const cv = (el as unknown as { checkValidity?: () => boolean }).checkValidity;
            if (typeof cv === "function") {
                if (!cv.call(el)) {
                    return false;
                }
            }
            if (el.hasAttribute("required") && !this._hasValue(el)) {
                return false;
            }
        }
        return true;
    }

    private _hasValue(el: HTMLElement): boolean {
        const v = (el as { value?: unknown }).value;
        if (v == null) {
            return false;
        }
        if (typeof v === "string") {
            return v.trim().length > 0;
        }
        if (Array.isArray(v)) {
            return v.length > 0;
        }
        return true;
    }

    private _collectInputs(): HTMLElement[] {
        const assigned = this._activeSlot?.assignedElements({ flatten: true }) ?? [];
        const out: HTMLElement[] = [];
        for (const root of assigned) {
            const el = root as HTMLElement;
            if (el.matches?.("[name]")) {
                out.push(el);
            }
            el.querySelectorAll?.("[name]").forEach((n) => out.push(n as HTMLElement));
        }
        return out;
    }

    // ── Auto summary ──────────────────────────────────────────────

    private _buildAutoSummary(): void {
        if (!this._summaryDl) {
            return;
        }
        this._summaryDl.replaceChildren();
        if (this.hasAttribute("has-summary")) {
            return;
        }

        const inputs = this._collectInputs();
        for (const el of inputs) {
            const name = el.getAttribute("name");
            if (!name) {
                continue;
            }
            // Prefer `displayValue` (a human-readable rendering exposed by
            // some inputs like autocomplete) over the raw `value` which
            // may be a machine-readable id (uuid, foreign key, etc.).
            const display = (el as { displayValue?: unknown }).displayValue;
            const raw = display !== undefined && display !== "" ? display : (el as { value?: unknown }).value;
            const value = this._stringify(raw);
            if (!value) {
                continue;
            }
            const dt = document.createElement("dt");
            dt.textContent = this._summaryLabel(el, name);
            const dd = document.createElement("dd");
            dd.textContent = value;
            this._summaryDl.append(dt, dd);
        }
    }

    private _stringify(v: unknown): string {
        if (v == null) {
            return "";
        }
        if (Array.isArray(v)) {
            return v.map((x) => String(x)).join(", ");
        }
        const s = String(v);
        return s.trim();
    }

    private _humanize(name: string): string {
        return name.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
    }

    private _summaryLabel(el: HTMLElement, name: string): string {
        const explicit = el.getAttribute("summary-label")?.trim();
        if (explicit) {
            return explicit;
        }

        const field = el.closest("base-form-field");
        const labelSlot = field?.querySelector('[slot="label"]');
        const fieldLabel = labelSlot?.textContent?.trim();
        if (fieldLabel) {
            return fieldLabel;
        }

        const controlLabel = el.getAttribute("label")?.trim();
        if (controlLabel) {
            return controlLabel;
        }

        const aria = el.getAttribute("aria-label")?.trim();
        if (aria) {
            return aria;
        }

        return this._humanize(name);
    }

    // ── Number badge ──────────────────────────────────────────────

    private _syncNumber(): void {
        if (!this._numberSpan) {
            return;
        }
        this._numberSpan.textContent = this.getAttribute("step-number") ?? "";
    }
}
