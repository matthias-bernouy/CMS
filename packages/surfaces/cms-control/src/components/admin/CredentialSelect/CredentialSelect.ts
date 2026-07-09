import { buildShadow, type Refs } from "./template";
import { closePanel, keyToRef, openPanel, refreshList, renderList, setValue } from "./controller";
import { destroyCreateDialog, openCreateDialog } from "./dialog";

/**
 * <cms-credential-select name="auth.bearer" label="Bearer token" value="${HUB_API_TOKEN}">
 *
 * Form-associated picker (via ElementInternals). Lists credentials from
 * `GET /api/secrets/keys`, lets the user pick one, opens a modal mini
 * dialog to create a new one without leaving the form. Stores `${KEY}`
 * (matches the resolver pattern); displays just `KEY` in the trigger.
 *
 * Surfaces use browser-native top-layer primitives:
 *   - `popover="auto"` for the dropdown — light-dismiss + escapes
 *     `transform`/`overflow:hidden` ancestors (modals, lateral dialogs).
 *   - a body-level `<p9r-modal>` (built lazily in `dialog.ts`) for the
 *     create form — appended to `document.body` so it escapes the
 *     editor's transformed subtree and centres on the viewport.
 */
export class CredentialSelect extends HTMLElement {

    static formAssociated = true;
    static observedAttributes = ["value"];

    _refs!: Refs;
    _internals: ElementInternals;
    _value = "";
    _isOpen = false;
    _keys: string[] = [];
    _createModal?: HTMLElement;

    private _onSecretSaved = () => { if (this._isOpen) void refreshList(this); };

    constructor() {
        super();
        this._internals = this.attachInternals();
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        if (name !== "value" || oldValue === newValue) return;
        const value = newValue ?? "";
        if (this._refs) setValue(this, value);
        else this._value = value;
    }

    connectedCallback() {
        // Build the shadow once — `attachShadow` throws if a shadow already
        // exists. Without this guard a disconnect/reconnect cycle (the
        // editor system re-stamps panels on mode switches) crashes here.
        if (!this.shadowRoot) {
            this._refs = buildShadow(this, this.getAttribute("label"));
            this._wire();
        }
        // Re-apply the buffered value on every (re)connection so a value
        // pushed before the shadow existed lands as soon as we have it.
        const v = this._value || this.getAttribute("value") || "";
        setValue(this, v);
        document.addEventListener("secret:saved", this._onSecretSaved);
    }

    disconnectedCallback() {
        document.removeEventListener("secret:saved", this._onSecretSaved);
        // The editor re-stamps panels on mode switches; drop the body-level
        // modal so reconnects don't leak orphaned copies into `document.body`.
        destroyCreateDialog(this);
    }

    get value() { return this._value; }
    set value(v: string) { setValue(this, v); }
    get name()  { return this.getAttribute("name"); }
    get _api()  { return this.getAttribute("api") ?? "/api/secrets"; }

    private _wire() {
        const r = this._refs;
        r.trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            this._isOpen ? closePanel(this) : openPanel(this);
        });
        r.clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            setValue(this, "");
            this.dispatchEvent(new Event("change", { bubbles: true }));
        });
        // Sync internal state when the popover light-dismisses (click outside / ESC).
        r.panel.addEventListener("toggle", (e) => {
            const newState = (e as ToggleEvent).newState;
            if (newState === "closed" && this._isOpen) closePanel(this);
        });
        r.search.addEventListener("input", () => {
            const q = r.search.value.trim().toUpperCase();
            const filtered = q ? this._keys.filter(k => k.includes(q)) : this._keys;
            renderList(this, filtered);
        });
        r.list.addEventListener("click", (e) => {
            const li = (e.target as HTMLElement).closest(".option") as HTMLElement | null;
            if (!li || !li.dataset.key) return;
            setValue(this, keyToRef(li.dataset.key));
            this.dispatchEvent(new Event("change", { bubbles: true }));
            closePanel(this);
        });
        r.createBtn.addEventListener("click", () => openCreateDialog(this));
    }
}

if (!customElements.get("cms-credential-select")) {
    customElements.define("cms-credential-select", CredentialSelect);
}
