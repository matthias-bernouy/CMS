import { showToast } from "cms-control/core/showToast";

/**
 * `<cms-provider-actions provider-id kind enabled base-url emit>` — the actions
 * cell for one identity-provider row. Renders a clean enable/disable toggle
 * (PATCH on click) and, for non-builtin providers only, a Remove button
 * (DELETE). The builtin `local` provider is a singleton — toggle only, never
 * removable. Emits `emit` on success so a `<cms-fetch reload-on>` refreshes.
 */
class CmsProviderActions extends HTMLElement {

    static get observedAttributes() { return ["provider-id", "kind", "enabled"]; }

    connectedCallback() { this._render(); }
    attributeChangedCallback() { if (this.isConnected) this._render(); }

    private get _base()    { return this.getAttribute("base-url") ?? "/api/identity/provider"; }
    private get _id()      { return this.getAttribute("provider-id") ?? ""; }
    private get _kind()    { return this.getAttribute("kind") ?? ""; }
    private get _enabled() { return this.getAttribute("enabled") === "true"; }
    private get _emit()    { return this.getAttribute("emit"); }
    private get _builtin() { return this._kind === "local"; }

    private _render() {
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        const on = this._enabled;
        root.innerHTML = `
        <style>
          :host { display: inline-flex; }
          .row { display: inline-flex; gap: .6rem; align-items: center; }
          .switch { width: 38px; height: 22px; padding: 0; border-radius: 11px; border: 1px solid var(--border-default, #ddd);
                    background: var(--bg-base, #eee); position: relative; cursor: pointer; transition: background .15s, border-color .15s; }
          .switch.on { background: var(--success-base, #16a34a); border-color: var(--success-base, #16a34a); }
          .switch .knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
                          background: #fff; transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
          .switch.on .knob { transform: translateX(16px); }
          .state { font-size: .85rem; color: var(--text-muted, #777); min-width: 4.5em; }
          .btn { font: inherit; cursor: pointer; border-radius: var(--radius-sm, 6px); padding: .3rem .55rem;
                 border: 1px solid var(--border-default, #ddd); background: var(--bg-surface, #fff); color: var(--text-body, #333); }
          .btn:hover { background: var(--bg-base, #f3f3f3); }
          .remove { border-color: var(--danger-muted, #fee2e2); color: var(--danger-base, #dc2626); }
          .remove:hover { background: var(--danger-muted, #fee2e2); }
        </style>
        <div class="row">
          <button type="button" class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" title="${on ? "Disable" : "Enable"}"><span class="knob"></span></button>
          <span class="state">${on ? "Enabled" : "Disabled"}</span>
          ${this._builtin ? "" : `<button type="button" class="btn edit">Edit</button>`}
          ${this._builtin ? "" : `<button type="button" class="btn remove">Remove</button>`}
        </div>`;
        root.querySelector(".switch")!.addEventListener("click", () => this._toggle());
        root.querySelector(".edit")?.addEventListener("click", () => document.getElementById(`edit-${this._id}`)?.setAttribute("open", ""));
        root.querySelector(".remove")?.addEventListener("click", () => this._remove());
    }

    private async _toggle() {
        const next = !this._enabled;
        if (await this._send("PATCH", { id: this._id, enabled: next })) {
            this.setAttribute("enabled", String(next));
            showToast(next ? "Provider enabled" : "Provider disabled", { type: "success" });
            this._fire();
        }
    }

    private async _remove() {
        if (!confirm(`Remove provider "${this._id}"?`)) return;
        if (await this._send("DELETE", { id: this._id })) {
            showToast("Provider removed", { type: "success" });
            this._fire();
        }
    }

    private async _send(method: string, body: unknown): Promise<boolean> {
        try {
            const res = await fetch(this._base, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            if (!res.ok) { showToast("Action failed", { type: "error" }); return false; }
            return true;
        } catch {
            showToast("Network error", { type: "error" });
            return false;
        }
    }

    private _fire() { if (this._emit) document.dispatchEvent(new Event(this._emit, { bubbles: true })); }
}

customElements.define("cms-provider-actions", CmsProviderActions);
