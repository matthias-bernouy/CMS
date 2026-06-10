import { showToast } from "cms-control/core/showToast";
import { escapeHtml as esc } from "cms-control/core/dom/escapeHtml";

type CmsGroup = { feature: string; label: string; permissions: { id: string; verb: string }[] };
type GwGroup  = { provider: string; label: string; endpoints: { id: string; label: string }[] };
type EditorData = {
    role:    { id: string; label: string; builtin: boolean; grants: string[] };
    catalog: { cms: CmsGroup[]; gateway: GwGroup[] };
};

/**
 * `<cms-role-editor api back>` — grant editor for one role (id read from the
 * page's `?id=`). Fetches the role's current grants + the available permission
 * vocabulary from `${api}/editor?id=`, then renders them as collapsible
 * sections (`p9r-accordion-item`, closed by default) of `w13c-checkbox`es —
 * CMS capabilities grouped by feature, gateway endpoints grouped by provider.
 * Each section header carries a live count of its selected permissions. On Save
 * it POSTs the checked permissions to `${api}` and returns to `back`.
 */
class CmsRoleEditor extends HTMLElement {

    private data: EditorData | null = null;

    private get _api()  { return this.getAttribute("api")  ?? "/api/roles"; }
    private get _back() { return this.getAttribute("back") ?? "/admin/roles"; }
    private get _id()   { return new URLSearchParams(location.search).get("id") ?? ""; }

    connectedCallback() { void this._load(); }

    private async _load() {
        const id = this._id;
        if (!id) { location.href = this._back; return; }
        try {
            const res = await fetch(`${this._api}/editor?id=${encodeURIComponent(id)}`, { headers: { Accept: "application/json" } });
            if (!res.ok) throw new Error();
            this.data = await res.json();
        } catch {
            const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
            root.innerHTML = `<p>Could not load this role.</p>`;
            return;
        }
        this._render();
    }

    private _render() {
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        const d = this.data!;
        const checked = new Set(d.role.grants);

        const cb = (id: string, label: string) =>
            `<w13c-checkbox value="${esc(id)}"${checked.has(id) ? " checked" : ""}>${esc(label)}</w13c-checkbox>`;

        const section = (label: string, items: { id: string; label: string }[]) => {
            const n = items.filter((i) => checked.has(i.id)).length;
            return `
              <p9r-accordion-item>
                <span slot="header" class="grp">${esc(label)}<span class="badge"${n ? "" : " hidden"}>${n}</span></span>
                <div class="grid">${items.map((i) => cb(i.id, i.label)).join("")}</div>
              </p9r-accordion-item>`;
        };

        const cmsItems = d.catalog.cms
            .map((g) => section(g.label, g.permissions.map((p) => ({ id: p.id, label: p.verb }))))
            .join("");

        const gwBlock = d.catalog.gateway.length
            ? `<p9r-accordion multiple>${d.catalog.gateway.map((g) => section(g.label, g.endpoints)).join("")}</p9r-accordion>`
            : `<p class="muted">No gateway providers configured.</p>`;

        root.innerHTML = `
          <style>
            :host { display:block; max-width: 64rem; }
            .intro { margin: 0 0 1.25rem; color: var(--text-body,#333); }
            .intro code { background: var(--bg-muted,#f3f4f6); padding: .1rem .4rem; border-radius: 4px; }
            section { margin: 0 0 1.5rem; }
            h3 { margin: 0 0 .6rem; font-size: 1rem; }
            p9r-accordion-item { display:block; }
            .grp { display:inline-flex; align-items:center; gap:.5rem; font-weight:600; }
            .badge { display:inline-flex; min-width:1.3rem; height:1.3rem; padding:0 .4rem; align-items:center; justify-content:center;
                     font-size:.72rem; font-weight:700; border-radius:999px; background: var(--bg-muted,#eef0f4); color: var(--text-body,#333); }
            .grid { display:flex; flex-wrap:wrap; gap:.55rem 1.75rem; padding:.5rem .25rem; }
            .muted { color: var(--text-muted,#666); }
            .bar { display:flex; align-items:center; gap:1rem; margin-top:1.75rem; }
            .cancel { text-decoration:none; color: var(--text-muted,#666); font:inherit; }
          </style>
          <p class="intro">Editing role <strong>${esc(d.role.label)}</strong> <code>${esc(d.role.id)}</code></p>

          <section>
            <h3>CMS capabilities</h3>
            <p9r-accordion multiple>${cmsItems}</p9r-accordion>
          </section>

          <section>
            <h3>Gateway endpoints</h3>
            ${gwBlock}
          </section>

          <div class="bar">
            <p9r-button color="primary" class="save">Save</p9r-button>
            <a class="cancel" href="${esc(this._back)}">Cancel</a>
          </div>`;

        root.querySelector(".save")!.addEventListener("click", () => void this._save());
        // Keep each section's count badge in sync as boxes are toggled.
        root.addEventListener("change", () => this._refreshBadges());
    }

    private _refreshBadges() {
        this.shadowRoot!.querySelectorAll("p9r-accordion-item").forEach((item) => {
            const n = item.querySelectorAll("w13c-checkbox[checked]").length;
            const badge = item.querySelector<HTMLElement>(".badge");
            if (!badge) return;
            badge.textContent = String(n);
            badge.toggleAttribute("hidden", n === 0);
        });
    }

    private async _save() {
        const grants = Array.from(this.shadowRoot!.querySelectorAll("w13c-checkbox"))
            .filter((el) => el.hasAttribute("checked"))
            .map((el) => ({ permission: el.getAttribute("value")! }));
        try {
            const res = await fetch(this._api, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: this.data!.role.id, label: this.data!.role.label, grants }),
            });
            if (res.ok) {
                showToast("Role permissions saved", { type: "success" });
                location.href = this._back;
            } else {
                showToast("Failed to save permissions", { type: "error" });
            }
        } catch {
            showToast("Network error", { type: "error" });
        }
    }
}

customElements.define("cms-role-editor", CmsRoleEditor);
