import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };
import { apiGet, apiSend, queryParam } from "../_base/api";

/**
 * `<hub-tenant-issuers tenant-id="...">` — editor for a tenant's trusted
 * issuer list (`string[]`). Add / remove rows, Save → PATCH
 * `/api/namespaces/tenants?tenantId=`. The list MAY be empty (a tenant can
 * exist with no issuer and have one attached later). `tenant-id` falls back
 * to the `tenantId` query param.
 */
export class HubTenantIssuers extends Component {
    private _issuers: string[] = [];

    constructor() {
        super({ css: css as unknown as string, template: "<div part='root'></div>" });
    }

    override connectedCallback() { void this._load(); }

    private get _tenantId(): string { return this.getAttribute("tenant-id") || queryParam("tenantId"); }
    private get _root(): HTMLElement { return this.shadowRoot!.querySelector("[part='root']") as HTMLElement; }

    private async _load() {
        const t = await apiGet<{ issuers?: string[] }>(`/api/namespaces/tenants?tenantId=${encodeURIComponent(this._tenantId)}`);
        this._issuers = t?.issuers ? [...t.issuers] : [];
        this._render();
    }

    private _render() {
        const root = this._root;
        root.innerHTML = "";
        const list = document.createElement("div");
        list.className = "list";
        this._issuers.forEach((iss, i) => list.appendChild(this._row(iss, i)));
        root.appendChild(list);

        const actions = document.createElement("div");
        actions.className = "actions";
        const add = document.createElement("p9r-button");
        add.setAttribute("variant", "ghost");
        add.textContent = "+ Add an issuer";
        add.addEventListener("click", () => { this._issuers.push(""); this._render(); });
        const save = document.createElement("p9r-button");
        save.setAttribute("color", "primary");
        save.textContent = "Save trust-list";
        save.addEventListener("click", () => void this._save());
        actions.append(add, save);
        root.appendChild(actions);

        const msg = document.createElement("div");
        msg.className = "msg";
        root.appendChild(msg);
    }

    private _row(iss: string, i: number): HTMLElement {
        const row = document.createElement("div");
        row.className = "row";
        const input = document.createElement("p9r-input");
        input.setAttribute("label", `Issuer ${i + 1}`);
        input.setAttribute("placeholder", "https://keycloak.example/realms/acme");
        input.setAttribute("value", iss);
        input.addEventListener("input", () => {
            this._issuers[i] = (input as any).value ?? input.getAttribute("value") ?? "";
        });
        const rm = document.createElement("p9r-button");
        rm.setAttribute("variant", "ghost");
        rm.setAttribute("color", "danger");
        rm.textContent = "✕";
        rm.addEventListener("click", () => { this._issuers.splice(i, 1); this._render(); });
        row.append(input, rm);
        return row;
    }

    private async _save() {
        const msg = this.shadowRoot!.querySelector(".msg") as HTMLElement;
        msg.innerHTML = "";
        const cleaned = this._issuers.map((s) => s.trim()).filter(Boolean);
        const res = await apiSend("PATCH",
            `/api/namespaces/tenants?tenantId=${encodeURIComponent(this._tenantId)}`,
            { issuers: cleaned });
        const alert = document.createElement("p9r-alert");
        if (res.ok) {
            alert.setAttribute("type", "success");
            alert.textContent = "Trust-list saved.";
            this._issuers = cleaned;
            document.dispatchEvent(new CustomEvent("tenant:updated", { bubbles: true }));
        } else {
            alert.setAttribute("type", "error");
            alert.textContent = `Failed: ${res.message}`;
        }
        msg.appendChild(alert);
    }
}

if (!customElements.get("hub-tenant-issuers")) customElements.define("hub-tenant-issuers", HubTenantIssuers);
