import { Component, type ComponentMetadata } from "@bernouy/cms-blocs/base";

/**
 * Shared base for the toggle form controls (`<w13c-checkbox>`, `<w13c-switch>`).
 * Owns the form-association internals and the reflective
 * `checked`/`disabled`/`name`/`value` accessors plus the default-capture / reset
 * bookkeeping that each such control otherwise repeated verbatim.
 *
 * Subclasses bring their own template/CSS and inner `<input>`, and own their
 * connect/attribute wiring; call `_captureDefaults()` once at the top of
 * `connectedCallback`. Subclasses with extra reset state (e.g. a checkbox's
 * `indeterminate`) override `_captureDefaults`/`formResetCallback` and chain via
 * `super`.
 */
export abstract class FormControlElement extends Component {
    static formAssociated = true;
    protected _internals: ElementInternals;
    protected _defaultChecked = false;
    protected _defaultsCaptured = false;

    constructor(metadata: ComponentMetadata) {
        super(metadata);
        this._internals = this.attachInternals();
    }

    /** Snapshot the boot-time `checked` state once so `formResetCallback` can
     *  restore it. Idempotent across re-connects. */
    protected _captureDefaults() {
        if (this._defaultsCaptured) return;
        this._defaultChecked = this.hasAttribute("checked");
        this._defaultsCaptured = true;
    }

    formResetCallback() {
        this.checked = this._defaultChecked;
    }

    get checked() { return this.hasAttribute("checked"); }
    set checked(v: boolean) { v ? this.setAttribute("checked", "") : this.removeAttribute("checked"); }

    get disabled() { return this.hasAttribute("disabled"); }
    set disabled(v: boolean) { v ? this.setAttribute("disabled", "") : this.removeAttribute("disabled"); }

    get name() { return this.getAttribute("name") ?? ""; }
    set name(v: string) { this.setAttribute("name", v); }

    get value() { return this.getAttribute("value") ?? "on"; }
    set value(v: string) { this.setAttribute("value", v); }

    get form() { return this._internals.form; }
}
