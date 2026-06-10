import { showToast } from "cms-control/core/showToast";
import { escapeHtml as esc } from "cms-control/core/dom/escapeHtml";

type RoleOption = { id: string; label: string };

/**
 * `<cms-role-select>` — a role dropdown whose options are fetched from
 * `GET /api/roles/list` (the roles assignable to a person). Two modes:
 *   - auto-save (users table): given `sub`, POSTs `{ sub, role }` to `url` on
 *     change, toasts, and dispatches `emit` on success.
 *   - form (create-user modal): given `name` and no `sub`, it is form-associated
 *     and contributes its value to the enclosing `<cms-form>` via FormData.
 */
class CmsRoleSelect extends HTMLElement {

    static formAssociated = true;
    static get observedAttributes() { return ["sub", "value"]; }

    private internals: ElementInternals;
    private roles: RoleOption[] = [];

    constructor() {
        super();
        this.internals = this.attachInternals();
    }

    connectedCallback() {
        // Seed the form value from the initial attribute so a submit that happens
        // before the options arrive still carries the default.
        this.internals.setFormValue(this._value);
        void this._load();
    }
    attributeChangedCallback() { if (this.isConnected) this._render(); }

    private get _url()     { return this.getAttribute("url") ?? "/api/users/role"; }
    private get _listUrl() { return this.getAttribute("list-url") ?? "/api/roles/list"; }
    private get _sub()     { return this.getAttribute("sub") ?? ""; }
    private get _value()   { return this.getAttribute("value") ?? "user"; }
    private get _emit()    { return this.getAttribute("emit"); }

    private async _load() {
        try {
            const res = await fetch(this._listUrl, { headers: { Accept: "application/json" } });
            this.roles = res.ok ? await res.json() : [];
        } catch {
            this.roles = [];
        }
        this._render();
    }

    private _render() {
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        const current = this._value;
        // Fall back to the current value as a lone option so the control still
        // shows something if the list failed or hasn't arrived.
        const opts = this.roles.length ? this.roles : [{ id: current, label: current }];
        root.innerHTML = `
        <style>
          select { font: inherit; padding: .35rem .5rem; border-radius: var(--radius-sm, 6px);
                   border: 1px solid var(--border-default, #ddd); background: var(--bg-surface, #fff); color: var(--text-body, #333); }
        </style>
        <select>${opts.map((r) => `<option value="${esc(r.id)}"${r.id === current ? " selected" : ""}>${esc(r.label)}</option>`).join("")}</select>`;
        const sel = root.querySelector("select")!;
        this.internals.setFormValue(sel.value);
        sel.addEventListener("change", () => this._onChange(sel.value));
    }

    private _onChange(role: string) {
        this.internals.setFormValue(role);     // form mode (harmless otherwise)
        if (this._sub) void this._save(role);  // auto-save mode
    }

    private async _save(role: string) {
        try {
            const res = await fetch(this._url, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sub: this._sub, role }),
            });
            if (res.ok) {
                showToast("Role updated", { type: "success" });
                if (this._emit) document.dispatchEvent(new Event(this._emit, { bubbles: true }));
            } else {
                showToast("Failed to update role", { type: "error" });
            }
        } catch {
            showToast("Network error", { type: "error" });
        }
    }

    get name() { return this.getAttribute("name"); }
}

customElements.define("cms-role-select", CmsRoleSelect);
