import { Component } from "../_base/Component";

/**
 * `<hub-field value="…" kind="url|code|text">` — renders a single TP-provided
 * tenant-info value per its `kind`: a link (http/https only), monospace code,
 * or plain text (default). Used to display `/api/namespaces/tenants/info`.
 */
export class HubField extends Component {
    override connectedCallback(): void {
        const value = this.getAttribute("value") ?? "";
        const kind  = this.getAttribute("kind") ?? "";
        let node: Node;
        if (kind === "url" && /^https?:\/\//i.test(value)) {
            const a = document.createElement("a");
            a.href = value;
            a.textContent = value;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            node = a;
        } else if (kind === "code") {
            const c = document.createElement("hub-code");
            c.textContent = value;
            node = c;
        } else {
            node = document.createTextNode(value);
        }
        this.shadowRoot!.replaceChildren(node);
    }
}

if (!customElements.get("hub-field")) customElements.define("hub-field", HubField);
