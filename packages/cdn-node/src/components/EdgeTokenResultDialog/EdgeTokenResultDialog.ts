import template from "./template.html" with { type: "text" };
import css      from "./style.css"     with { type: "text" };

const TEMPLATE = template as unknown as string;
const STYLE    = css      as unknown as string;

/**
 * Dialog that pops up after a successful edge creation, showing the
 * plaintext bearer token once. Plug into a `<w13c-form emit="edge:added">`
 * by setting `listen-on="edge:added"` on this element. The token is read
 * from `event.detail.body.data.plaintextToken`.
 *
 * Mirror of cdn-buckets's `<bsp-credential-result>` — same pattern, same
 * UX, different field name (`plaintextToken` vs `cleartextToken`).
 */
export class EdgeTokenResultDialog extends HTMLElement {

    private _dialog: HTMLDialogElement | null = null;
    private _token:  HTMLInputElement  | null = null;
    private _eventName: string | null = null;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });

        const styleEl = document.createElement("style");
        styleEl.textContent = STYLE;
        shadow.appendChild(styleEl);

        const tpl = document.createElement("template");
        tpl.innerHTML = TEMPLATE;
        shadow.appendChild(tpl.content.cloneNode(true));

        this._dialog = shadow.querySelector("dialog");
        this._token  = shadow.querySelector(".token");
    }

    connectedCallback() {
        this._eventName = this.getAttribute("listen-on");
        if (this._eventName) document.addEventListener(this._eventName, this._onEvent);
        this.shadowRoot?.querySelector(".copy")?.addEventListener("click", this._onCopy);
        this.shadowRoot?.querySelector(".close")?.addEventListener("click", this._onClose);
    }

    disconnectedCallback() {
        if (this._eventName) document.removeEventListener(this._eventName, this._onEvent);
    }

    private _onEvent = (e: Event) => {
        const token = (e as CustomEvent).detail?.body?.data?.plaintextToken;
        if (typeof token !== "string" || !this._dialog || !this._token) return;
        this._token.value = token;
        this._dialog.showModal();
    };

    private _onCopy = async () => {
        if (!this._token) return;
        try {
            await navigator.clipboard.writeText(this._token.value);
        } catch {
            this._token.select();
        }
    };

    private _onClose = () => this._dialog?.close();
}

if (!customElements.get("bso-edge-token-result")) {
    customElements.define("bso-edge-token-result", EdgeTokenResultDialog);
}
