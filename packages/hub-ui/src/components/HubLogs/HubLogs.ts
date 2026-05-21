import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };
import { apiGet, queryParam } from "../_base/api";

interface LogRecord {
    ts: string; kind: string; level: string; event: string;
    tenantId: string | null; outcome?: string; requestId: string; providerId: string;
}

/**
 * `<hub-logs src="/api/providers/logs">` — log viewer backed by a hub log
 * endpoint that proxies a DP's `/admin/logs`. Forwards the page's
 * `tenantId` / `providerId` query param to the endpoint (like `<hub-json>`),
 * adds kind/level filter selects, renders a table, and pages via the
 * `nextCursor` returned by the DP ("Load more").
 */
export class HubLogs extends Component {
    private _items: LogRecord[] = [];
    private _cursor: string | undefined = undefined;
    private _kind = "";
    private _level = "";

    private _onTenantEvent = () => { void this._load(true); };

    constructor() {
        super({ css: css as unknown as string, template: "<div part='root'></div>" });
    }

    override connectedCallback() {
        this._renderShell();
        void this._load(true);
        // Tenant mutations produce new provider-side logs — refresh so the
        // view isn't stale after an add/update/remove elsewhere on the page.
        for (const ev of ["tenant:created", "tenant:updated", "tenant:removed"]) {
            document.addEventListener(ev, this._onTenantEvent);
        }
    }

    disconnectedCallback() {
        for (const ev of ["tenant:created", "tenant:updated", "tenant:removed"]) {
            document.removeEventListener(ev, this._onTenantEvent);
        }
    }

    private get _src(): string { return this.getAttribute("src") || ""; }
    private get _root(): HTMLElement { return this.shadowRoot!.querySelector("[part='root']") as HTMLElement; }

    private _scopeParam(): string {
        // The endpoint expects one scope id — tenantId (tenant), providerId
        // (DP) or namespaceId (whole namespace). Forward the highest-priority
        // one the page carries (a tenant page has both tenantId + namespaceId,
        // and its `src` points at the tenant endpoint, so tenantId wins).
        for (const key of ["tenantId", "providerId", "namespaceId"]) {
            const v = queryParam(key);
            if (v) return `${key}=${encodeURIComponent(v)}`;
        }
        return "";
    }

    private _renderShell() {
        const root = this._root;
        root.innerHTML = "";

        const bar = document.createElement("div");
        bar.className = "bar";
        bar.append(
            this._select("kind", "Kind", ["all", "security", "audit", "request"], (v) => { this._kind = v; void this._load(true); }),
            this._select("level", "Level", ["all", "debug", "info", "warn", "error"], (v) => { this._level = v; void this._load(true); }),
        );

        const table = document.createElement("div");
        table.className = "rows";

        const more = document.createElement("p9r-button");
        more.setAttribute("variant", "ghost");
        more.className = "more";
        more.textContent = "Load more";
        more.addEventListener("click", () => void this._load(false));

        const empty = document.createElement("p9r-alert");
        empty.setAttribute("type", "info");
        empty.className = "empty";
        empty.textContent = "No log entries.";

        root.append(bar, table, empty, more);
    }

    private _select(name: string, label: string, opts: string[], onChange: (v: string) => void): HTMLElement {
        const sel = document.createElement("p9r-select") as any;
        sel.setAttribute("name", name);
        sel.setAttribute("label", label);
        for (const o of opts) {
            const opt = document.createElement("option");
            opt.value = o; opt.textContent = o === "all" ? "All" : o;
            if (o === "all") opt.setAttribute("selected", "");   // default to "All"
            sel.appendChild(opt);
        }
        // "all" is a sentinel for "no filter" — p9r-select needs a truthy
        // value to render its label, so we map it back to "" here.
        sel.addEventListener("change", () => {
            const v = sel.value ?? sel.getAttribute("value") ?? "all";
            onChange(v === "all" ? "" : v);
        });
        return sel;
    }

    private async _load(reset: boolean) {
        if (reset) { this._items = []; this._cursor = undefined; }
        const scope = this._scopeParam();
        if (!this._src || !scope) return;
        const qs = new URLSearchParams(scope);
        if (this._kind)   qs.set("kind", this._kind);
        if (this._level)  qs.set("level", this._level);
        qs.set("limit", "50");
        if (this._cursor) qs.set("cursor", this._cursor);

        const data = await apiGet<{ items: LogRecord[]; nextCursor?: string }>(`${this._src}?${qs.toString()}`);
        const page = data ?? { items: [], nextCursor: undefined };
        this._items = reset ? page.items : [...this._items, ...page.items];
        this._cursor = page.nextCursor;
        this._renderRows();
    }

    private _renderRows() {
        const rows  = this.shadowRoot!.querySelector(".rows") as HTMLElement;
        const empty = this.shadowRoot!.querySelector(".empty") as HTMLElement;
        const more  = this.shadowRoot!.querySelector(".more") as HTMLElement;
        rows.innerHTML = "";
        empty.hidden = this._items.length > 0;
        more.hidden  = !this._cursor;

        for (const r of this._items) {
            const row = document.createElement("div");
            row.className = `row level-${r.level}`;
            row.innerHTML = `
                <span class="ts">${this._esc(r.ts)}</span>
                <span class="tag kind">${this._esc(r.kind)}</span>
                <span class="tag level">${this._esc(r.level)}</span>
                <span class="event">${this._esc(r.event)}</span>
                <span class="meta">${this._esc(r.outcome ?? "")}${r.tenantId ? " · " + this._esc(r.tenantId) : ""}</span>`;
            rows.appendChild(row);
        }
    }

    private _esc(s: string): string {
        return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    }
}

if (!customElements.get("hub-logs")) customElements.define("hub-logs", HubLogs);
