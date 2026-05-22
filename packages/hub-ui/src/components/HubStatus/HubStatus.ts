import { Component } from "../_base/Component";

/**
 * `<hub-status value="active">` — renders a tenant status as a coloured
 * `<p9r-badge>` (green when active, red otherwise), so every table/detail
 * shows the same consistent badge using the repo's webcomponents.
 */
const ACTIVE = new Set(["active", "enabled", "ok", "up"]);

export class HubStatus extends Component {
    override connectedCallback(): void {
        const value = (this.getAttribute("value") ?? "").trim();
        const color = ACTIVE.has(value.toLowerCase()) ? "success" : "danger";
        const badge = document.createElement("p9r-badge");
        badge.setAttribute("color", color);
        badge.setAttribute("dot", "");
        badge.textContent = value || "unknown";
        this.shadowRoot!.replaceChildren(badge);
    }
}

if (!customElements.get("hub-status")) customElements.define("hub-status", HubStatus);
