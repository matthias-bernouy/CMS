import template from "./template.html" with { type: "text" };
import css      from "./style.css"     with { type: "text" };

const TEMPLATE = template as unknown as string;
const STYLE    = css      as unknown as string;

type ProxyAuth =
    | { type: "none" }
    | { type: "bearer";  token: string }
    | { type: "headers"; headers: { name: string; value: string }[] };

/**
 * Form to create or update a bucket proxy. Wraps a `<form>` that POSTs
 * `{ providerId, server, auth }` to the configured `target` URL — the
 * structured `auth` object is assembled here from flat form fields, so
 * the upstream `parseProxyAuth` validator stays simple.
 *
 * Attributes:
 *   target   — URL to POST to (e.g. `/admin/api/proxies?bucketId=xxx`).
 *   emit     — optional event name dispatched on `document` on success
 *              (mirrors `<w13c-form>` semantics so `<w13c-fetch reload-on>`
 *              picks it up).
 *
 * Events:
 *   form:success — bubbles + composed, with `detail = { status, body }`.
 *                  Parent `<p9r-modal>` listens for this and auto-closes.
 *   form:failed  — same shape on non-2xx responses.
 */
export class ProxyCreateForm extends HTMLElement {

    private _form:    HTMLFormElement   | null = null;
    private _select:  HTMLSelectElement | null = null;
    private _error:   HTMLParagraphElement | null = null;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });

        const styleEl = document.createElement("style");
        styleEl.textContent = STYLE;
        shadow.appendChild(styleEl);

        const tpl = document.createElement("template");
        tpl.innerHTML = TEMPLATE;
        shadow.appendChild(tpl.content.cloneNode(true));

        this._form   = shadow.querySelector("form");
        this._select = shadow.querySelector("select[name='authType']");
        this._error  = shadow.querySelector(".error");
    }

    connectedCallback() {
        this._syncAuthType();
        this._form?.addEventListener("submit", this._onSubmit);
        this._select?.addEventListener("change", this._syncAuthType);
    }

    disconnectedCallback() {
        this._form?.removeEventListener("submit", this._onSubmit);
        this._select?.removeEventListener("change", this._syncAuthType);
    }

    get target(): string { return this.getAttribute("target") ?? ""; }
    get emit():   string { return this.getAttribute("emit")   ?? ""; }

    private _syncAuthType = () => {
        const value = this._select?.value ?? "none";
        this.setAttribute("data-auth-type", value);
    };

    private _showError(msg: string) {
        if (!this._error) return;
        this._error.textContent = msg;
        this._error.hidden = false;
    }

    private _clearError() {
        if (!this._error) return;
        this._error.textContent = "";
        this._error.hidden = true;
    }

    private _buildAuth(formData: FormData): ProxyAuth {
        const type = String(formData.get("authType") ?? "none");
        if (type === "none")   return { type: "none" };
        if (type === "bearer") {
            const token = String(formData.get("authToken") ?? "");
            return { type: "bearer", token };
        }
        if (type === "headers") {
            const raw = String(formData.get("authHeaders") ?? "").trim();
            if (!raw) return { type: "headers", headers: [] };
            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch {
                throw new Error("Headers field is not valid JSON.");
            }
            if (!Array.isArray(parsed)) throw new Error("Headers must be a JSON array.");
            const headers = parsed.map((h, i) => {
                if (typeof h !== "object" || h === null) throw new Error(`headers[${i}] is not an object.`);
                const name  = (h as Record<string, unknown>).name;
                const value = (h as Record<string, unknown>).value;
                if (typeof name  !== "string") throw new Error(`headers[${i}].name must be a string.`);
                if (typeof value !== "string") throw new Error(`headers[${i}].value must be a string.`);
                return { name, value };
            });
            return { type: "headers", headers };
        }
        throw new Error(`Unknown auth type: ${type}`);
    }

    private _onSubmit = async (e: SubmitEvent) => {
        e.preventDefault();
        this._clearError();
        if (!this._form || !this.target) return;

        const formData = new FormData(this._form);
        let auth: ProxyAuth;
        try {
            auth = this._buildAuth(formData);
        } catch (err) {
            this._showError(err instanceof Error ? err.message : String(err));
            return;
        }

        const payload = {
            providerId: String(formData.get("providerId") ?? ""),
            server:     String(formData.get("server")     ?? ""),
            auth,
        };

        const submitBtn = this._form.querySelector("button[type='submit']") as HTMLButtonElement | null;
        if (submitBtn) submitBtn.disabled = true;

        // Forward every query param of the current page URL onto the
        // target so `bucketId` (and friends) ride along — mirrors
        // `buildRequestUrl` from `@bernouy/webcomponents`. The admin
        // proxies endpoint expects `?bucketId=...` from the page.
        const url = new URL(this.target, window.location.href);
        for (const [k, v] of new URLSearchParams(window.location.search)) url.searchParams.append(k, v);

        try {
            const res = await fetch(url, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(payload),
            });
            const body = await res.json().catch(() => null);
            const detail = { status: res.status, body };

            if (res.ok) {
                this._form.reset();
                this._syncAuthType();
                this.dispatchEvent(new CustomEvent("form:success", { bubbles: true, composed: true, detail }));
                if (this.emit) {
                    document.dispatchEvent(new CustomEvent(this.emit, { bubbles: true, composed: true, detail }));
                }
            } else {
                const msg = body?.error?.message ?? `Server error (${res.status})`;
                this._showError(String(msg));
                this.dispatchEvent(new CustomEvent("form:failed", { bubbles: true, composed: true, detail }));
            }
        } catch (err) {
            this._showError(err instanceof Error ? err.message : "Network error.");
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    };
}

if (!customElements.get("bsp-proxy-create-form")) {
    customElements.define("bsp-proxy-create-form", ProxyCreateForm);
}
