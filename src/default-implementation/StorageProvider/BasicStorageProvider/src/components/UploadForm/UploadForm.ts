import template from "./template.html" with { type: "text" };
import css      from "./style.css"     with { type: "text" };

const TEMPLATE = template as unknown as string;
const STYLE    = css      as unknown as string;

/**
 * Multipart-friendly companion to `<w13c-form>`. Reads `target` and `emit`
 * the same way, but POSTs `multipart/form-data` so a `<input type="file">`
 * can ride along. Mirrors `buildRequestUrl` by forwarding any query param of
 * `window.location.search` onto the target — that's how `bucketId` and
 * `folderID` flow through without each form having to re-state them.
 */
export class UploadForm extends HTMLElement {

    private _form:        HTMLFormElement   | null = null;
    private _file:        HTMLInputElement  | null = null;
    private _name:        HTMLInputElement  | null = null;
    private _publicPath:  HTMLInputElement  | null = null;
    private _submit:      HTMLButtonElement | null = null;
    private _status:      HTMLElement       | null = null;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });

        const styleEl = document.createElement("style");
        styleEl.textContent = STYLE;
        shadow.appendChild(styleEl);

        const tpl = document.createElement("template");
        tpl.innerHTML = TEMPLATE;
        shadow.appendChild(tpl.content.cloneNode(true));

        this._form       = shadow.querySelector("form");
        this._file       = shadow.querySelector("input[type=file]");
        this._name       = shadow.querySelector("input[name=name]");
        this._publicPath = shadow.querySelector("input[name=publicPath]");
        this._submit     = shadow.querySelector("button[type=submit]");
        this._status     = shadow.querySelector(".status");
    }

    connectedCallback() {
        this._form?.addEventListener("submit", this._onSubmit);
        this._file?.addEventListener("change", this._onFileChange);
    }

    disconnectedCallback() {
        this._form?.removeEventListener("submit", this._onSubmit);
        this._file?.removeEventListener("change", this._onFileChange);
    }

    private _onFileChange = () => {
        const picked = this._file?.files?.[0];
        if (picked && this._name && !this._name.value) this._name.value = picked.name;
    };

    private _onSubmit = async (e: Event) => {
        e.preventDefault();
        const target = this.getAttribute("target");
        const emit   = this.getAttribute("emit");
        const picked = this._file?.files?.[0];
        if (!target || !picked) return;

        const fd = new FormData();
        fd.append("file", picked);
        if (this._name?.value)       fd.append("name",       this._name.value);
        if (this._publicPath?.value) fd.append("publicPath", this._publicPath.value);

        const url = new URL(target, window.location.href);
        for (const [k, v] of new URLSearchParams(window.location.search)) url.searchParams.append(k, v);

        this._setStatus("Uploading…", null);
        if (this._submit) this._submit.disabled = true;

        try {
            const res = await fetch(url, { method: "POST", body: fd });
            const body = await res.json().catch(() => null);

            if (res.ok) {
                this._setStatus("Done.", "ok");
                this._form?.reset();
                if (emit) document.dispatchEvent(new CustomEvent(emit, {
                    bubbles: true, composed: true, detail: { status: res.status, body },
                }));
            } else {
                const msg = body?.error?.message ?? `HTTP ${res.status}`;
                this._setStatus(`Error: ${msg}`, "error");
            }
        } catch (err) {
            this._setStatus(`Error: ${(err as Error).message}`, "error");
        } finally {
            if (this._submit) this._submit.disabled = false;
        }
    };

    private _setStatus(text: string, state: "ok" | "error" | null) {
        if (!this._status) return;
        this._status.textContent = text;
        if (state) this._status.setAttribute("data-state", state);
        else       this._status.removeAttribute("data-state");
    }
}

if (!customElements.get("bsp-upload-form")) {
    customElements.define("bsp-upload-form", UploadForm);
}
