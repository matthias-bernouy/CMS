import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };
import { apiGet, apiSend, queryParam } from "../_base/api";

/**
 * `<hub-tenant-config-form tenant-id="...">` — loads the DP's `tenantConfig`
 * schema + the tenant's current config, renders a `<hub-config-form>`, and
 * saves via PATCH `/api/namespaces/tenants?tenantId=` with `{ providerConfig }`.
 * The `providerId` is resolved from the tenant record.
 */
export class HubTenantConfigForm extends Component {
    constructor() {
        super({ css: css as unknown as string, template: "<div part='root'></div>" });
    }

    override connectedCallback() { void this._load(); }

    private get _tenantId(): string { return this.getAttribute("tenant-id") || queryParam("tenantId"); }
    private get _root(): HTMLElement { return this.shadowRoot!.querySelector("[part='root']") as HTMLElement; }

    private _info(type: string, text: string) {
        const a = document.createElement("p9r-alert");
        if (type) a.setAttribute("type", type);
        a.textContent = text;
        this._root.replaceChildren(a);
    }

    private async _load() {
        this._root.textContent = "Loading…";
        const tenantId = this._tenantId;
        const tenant = await apiGet<{ providerId: string }>(`/api/namespaces/tenants?tenantId=${encodeURIComponent(tenantId)}`);
        if (!tenant) { this._info("error", "Unknown tenant."); return; }

        const dp = await apiGet<{ schemas?: { tenantConfig?: any } }>(`/api/providers?providerId=${encodeURIComponent(tenant.providerId)}`);
        const schema = dp?.schemas?.tenantConfig ?? null;
        if (!schema) { this._info("", "This data-provider declares no tenantConfig — nothing to edit here."); return; }

        const live = await apiGet<{ config?: any }>(`/api/namespaces/tenants/config?tenantId=${encodeURIComponent(tenantId)}`);
        this._renderForm(schema, live?.config ?? {});
    }

    private _renderForm(schema: any, value: any) {
        this._root.innerHTML = "";
        const form = document.createElement("form");
        const cf = document.createElement("hub-config-form") as any;
        cf.setAttribute("mode", "control-plane");
        cf.setAttribute("prefix", "providerConfig");
        cf.setAttribute("schema", JSON.stringify(schema));
        cf.setAttribute("value", JSON.stringify(value));
        form.appendChild(cf);

        const submit = document.createElement("p9r-button");
        submit.setAttribute("color", "primary");
        submit.setAttribute("type", "submit");
        submit.textContent = "Save config";
        form.appendChild(submit);

        const msg = document.createElement("div");
        msg.className = "msg";
        form.appendChild(msg);

        form.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            msg.innerHTML = "";
            const res = await apiSend("PATCH",
                `/api/namespaces/tenants?tenantId=${encodeURIComponent(this._tenantId)}`,
                { providerConfig: cf.getValues() });
            const a = document.createElement("p9r-alert");
            if (res.ok) {
                a.setAttribute("type", "success");
                a.textContent = "Config saved.";
                document.dispatchEvent(new CustomEvent("tenant:updated", { bubbles: true }));
            } else {
                a.setAttribute("type", "error");
                a.textContent = `Failed: ${res.message}`;
            }
            msg.appendChild(a);
        });

        this._root.appendChild(form);
    }
}

if (!customElements.get("hub-tenant-config-form")) customElements.define("hub-tenant-config-form", HubTenantConfigForm);
