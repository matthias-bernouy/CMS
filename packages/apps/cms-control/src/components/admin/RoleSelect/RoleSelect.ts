import { showToast } from "cms-control/core/showToast";

const ROLES = ["user", "admin"] as const;

/**
 * `<cms-role-select sub value url emit>` — a role dropdown that auto-saves
 * on change (POST `{ sub, role }`), with a toast. No Save button. Emits
 * `emit` on success.
 */
class CmsRoleSelect extends HTMLElement {

    static get observedAttributes() { return ["sub", "value"]; }

    connectedCallback() { this._render(); }
    attributeChangedCallback() { if (this.isConnected) this._render(); }

    private get _url()   { return this.getAttribute("url") ?? "/api/users/role"; }
    private get _sub()   { return this.getAttribute("sub") ?? ""; }
    private get _value() { return this.getAttribute("value") ?? "user"; }
    private get _emit()  { return this.getAttribute("emit"); }

    private _render() {
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        root.innerHTML = `
        <style>
          select { font: inherit; padding: .35rem .5rem; border-radius: var(--radius-sm, 6px);
                   border: 1px solid var(--border-default, #ddd); background: var(--bg-surface, #fff); color: var(--text-body, #333); }
        </style>
        <select>${ROLES.map(r => `<option value="${r}"${r === this._value ? " selected" : ""}>${r}</option>`).join("")}</select>`;
        const sel = root.querySelector("select")!;
        sel.addEventListener("change", () => this._save(sel.value));
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
}

customElements.define("cms-role-select", CmsRoleSelect);
