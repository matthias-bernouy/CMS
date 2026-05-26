import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };
import { apiGet, apiSend, queryParam } from "../_base/api";

type ProviderRow = { providerId: string; providerKind?: string };

/**
 * `<hub-add-tenant namespace-id="...">` — modal content for adding a tenant:
 * a tenant-provisioner `<p9r-select>` (populated from `/api/providers`), an
 * optional display name, and — when the selected provider declares a
 * `tenantConfig` schema — its config form, so **required config (e.g. the CMS
 * admin OIDC) is collected at creation** rather than in a second step. POSTs
 * `{ issuers: [], displayName?, providerConfig? }` (issuers are attached later
 * in the tenant detail). On success dispatches `tenant:created` on `document`
 * so a sibling `<w13c-fetch reload-on="tenant:created">` refreshes.
 *
 * Meant to live inside a `<p9r-modal>` opened by a `<p9r-open-modal>` button.
 */
export class HubAddTenant extends Component {
    private _configForm: any | null = null;

    constructor() {
        super({ css: css as unknown as string, template: "<div part='root'></div>" });
    }

    override connectedCallback() { void this._render(); }

    private get _namespaceId(): string { return this.getAttribute("namespace-id") || queryParam("namespaceId"); }
    private get _root(): HTMLElement { return this.shadowRoot!.querySelector("[part='root']") as HTMLElement; }

    private async _render() {
        const root = this._root;
        root.textContent = "Loading tenant-provisioners…";
        const data = await apiGet<{ providers: ProviderRow[] }>("/api/providers");
        const providers = data?.providers ?? [];
        root.innerHTML = "";

        if (providers.length === 0) {
            const a = document.createElement("p9r-alert");
            a.setAttribute("type", "info");
            a.innerHTML = `No tenant-provisioner imported. <a href="../providers/">Import one first</a>.`;
            root.appendChild(a);
            return;
        }

        const select = document.createElement("p9r-select") as any;
        select.setAttribute("name", "providerId");
        select.setAttribute("label", "Tenant-provisioner");
        for (const p of providers) {
            const o = document.createElement("option");
            o.value = p.providerId;
            o.textContent = p.providerKind ? `${p.providerId} (${p.providerKind})` : p.providerId;
            select.appendChild(o);
        }

        const name = document.createElement("p9r-input");
        name.setAttribute("name", "displayName");
        name.setAttribute("label", "Display name (optional)");

        // Holds the selected provider's config form (rendered from its
        // tenantConfig schema). Refreshed whenever the provider changes.
        const configSlot = document.createElement("div");
        configSlot.className = "config";

        const create = document.createElement("p9r-button");
        create.setAttribute("color", "primary");
        create.textContent = "Create tenant";
        create.addEventListener("click", () => void this._create(select, name as any, create));

        const msg = document.createElement("div");
        msg.className = "msg";

        root.append(select, name, configSlot, create, msg);

        select.addEventListener("change", () => void this._loadConfig(select.value, configSlot));
        await this._loadConfig(providers[0]!.providerId, configSlot);
    }

    /** Fetch the provider's tenantConfig schema and render its form — or clear
     *  the slot when the provider declares none (e.g. a stateless TP). */
    private async _loadConfig(providerId: string, slot: HTMLElement) {
        this._configForm = null;
        slot.innerHTML = "";
        if (!providerId) return;
        const dp = await apiGet<{ schemas?: { tenantConfig?: unknown } }>(`/api/providers?providerId=${encodeURIComponent(providerId)}`);
        const schema = dp?.schemas?.tenantConfig ?? null;
        if (!schema) return;

        const cf = document.createElement("hub-config-form") as any;
        cf.setAttribute("mode", "control-plane");
        cf.setAttribute("prefix", "providerConfig");
        cf.setAttribute("schema", JSON.stringify(schema));
        cf.setAttribute("value", "{}");
        slot.appendChild(cf);
        this._configForm = cf;
    }

    private async _create(select: any, name: any, btn: HTMLElement) {
        const msg = this.shadowRoot!.querySelector(".msg") as HTMLElement;
        msg.innerHTML = "";
        const providerId = select.value ?? select.getAttribute("value") ?? "";
        if (!providerId) { this._error(msg, "Pick a tenant-provisioner."); return; }
        const displayName = (name.value ?? name.getAttribute("value") ?? "").trim();

        let providerConfig: Record<string, unknown> | undefined;
        if (this._configForm) {
            if (!this._configForm.isValid()) { this._error(msg, "Fill in the required configuration fields."); return; }
            providerConfig = this._configForm.getValues();
        }

        btn.setAttribute("disabled", "");
        const url = `/api/namespaces/tenants?namespaceId=${encodeURIComponent(this._namespaceId)}&providerId=${encodeURIComponent(providerId)}`;
        const res = await apiSend("POST", url, {
            issuers: [],
            ...(displayName ? { displayName } : {}),
            ...(providerConfig ? { providerConfig } : {}),
        });
        btn.removeAttribute("disabled");

        if (res.ok) {
            document.dispatchEvent(new CustomEvent("tenant:created", { bubbles: true }));
            // p9r-modal hides on `form:success` (bubbles + composed crosses the
            // shadow boundary up to the modal host).
            this.dispatchEvent(new CustomEvent("form:success", { bubbles: true, composed: true }));
        } else {
            this._error(msg, res.message);
        }
    }

    private _error(msg: HTMLElement, text: string) {
        const a = document.createElement("p9r-alert");
        a.setAttribute("type", "error");
        a.textContent = `Failed: ${text}`;
        msg.appendChild(a);
    }
}

if (!customElements.get("hub-add-tenant")) customElements.define("hub-add-tenant", HubAddTenant);
