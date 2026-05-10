import template from "./template.html" with { type: "text" };
import css      from "./style.css"     with { type: "text" };
import { RULE_TEMPLATES } from "@bernouy/cdn-buckets/templates";

const TEMPLATE = template as unknown as string;
const STYLE    = css      as unknown as string;

type ValidateError    = { path: string; message: string };
type ValidateResponse = { ok: true; referenced: string[] } | { ok: false; errors: ValidateError[] };

/**
 * Editor for `BucketProxy.rules + secrets`. Parses + validates the rules
 * JSON in real time against `POST /admin/api/proxies/validate`, surfaces
 * the first error with its JSON-pointer-style path, and submits to
 * `POST /admin/api/proxies` on success.
 *
 * Attributes:
 *   target  — base URL of the proxies admin (e.g. `{{BASE_PATH}}/api/proxies`).
 *             The validate endpoint is derived as `${target}/validate`.
 *   emit    — event name dispatched on `document` after a successful create.
 */
export class ProxyRulesEditor extends HTMLElement {

    private _form!:        HTMLFormElement;
    private _providerId!:  HTMLInputElement;
    private _server!:      HTMLInputElement;
    private _rules!:       HTMLTextAreaElement;
    private _errors!:      HTMLElement;
    private _secretsList!: HTMLElement;
    private _addSecret!:   HTMLButtonElement;
    private _submit!:      HTMLButtonElement;
    private _status!:      HTMLElement;
    private _picker!:      HTMLSelectElement;
    private _pickerHint!:  HTMLElement;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        const style  = document.createElement("style");
        style.textContent = STYLE;
        shadow.appendChild(style);
        const tpl = document.createElement("template");
        tpl.innerHTML = TEMPLATE;
        shadow.appendChild(tpl.content.cloneNode(true));

        this._form        = shadow.querySelector("form")!;
        this._providerId  = shadow.querySelector("input[name=providerId]")!;
        this._server      = shadow.querySelector("input[name=server]")!;
        this._rules       = shadow.querySelector("textarea[name=rules]")!;
        this._errors      = shadow.querySelector(".errors")!;
        this._secretsList = shadow.querySelector(".secrets-list")!;
        this._addSecret   = shadow.querySelector(".add-secret")!;
        this._submit      = shadow.querySelector("button[type=submit]")!;
        this._status      = shadow.querySelector(".status")!;
        this._picker      = shadow.querySelector(".template-picker")!;
        this._pickerHint  = shadow.querySelector(".template-hint")!;

        for (let i = 0; i < RULE_TEMPLATES.length; i++) {
            const opt = document.createElement("option");
            opt.value       = String(i);
            opt.textContent = RULE_TEMPLATES[i]!.label;
            this._picker.appendChild(opt);
        }
    }

    connectedCallback() {
        this._rules.addEventListener("blur",     this._validate);
        this._addSecret.addEventListener("click", () => this._addSecretRow());
        this._picker.addEventListener("change",  this._onTemplatePick);
        this._form.addEventListener("submit",    this._onSubmit);
    }

    private _onTemplatePick = () => {
        const idx = Number(this._picker.value);
        const tpl = RULE_TEMPLATES[idx];
        if (!tpl) return;
        this._rules.value = JSON.stringify(tpl.rules, null, 2);
        this._secretsList.innerHTML = "";
        for (const [name, value] of Object.entries(tpl.secrets)) this._addSecretRow(name, value);
        this._pickerHint.textContent = tpl.description;
        void this._validate();
    };

    private _addSecretRow(envName = "", value = ""): void {
        const row = document.createElement("div");
        row.className = "secret-row";
        row.innerHTML = `
            <input class="env"   placeholder="ENV_NAME" value="${escapeAttr(envName)}">
            <input class="value" placeholder="cleartext" type="password" value="${escapeAttr(value)}">
            <button type="button" class="remove" aria-label="Remove">×</button>`;
        row.querySelector(".remove")!.addEventListener("click", () => row.remove());
        this._secretsList.appendChild(row);
    }

    /** Read every `.secret-row` into an `{ envName: cleartext }` map. */
    private _collectSecrets(): Record<string, string> {
        const out: Record<string, string> = {};
        const rows = Array.from(this._secretsList.querySelectorAll(".secret-row"));
        for (const row of rows) {
            const env = (row.querySelector(".env")   as HTMLInputElement).value.trim();
            const val = (row.querySelector(".value") as HTMLInputElement).value;
            if (env) out[env] = val;
        }
        return out;
    }

    private _setRulesState(state: "ok" | "error" | null) {
        if (state) this._rules.setAttribute("data-state", state);
        else       this._rules.removeAttribute("data-state");
    }

    /** Show validation feedback. `errors[]` empty + ok=true means clean. */
    private _showFeedback(res: ValidateResponse) {
        if (res.ok) {
            this._setRulesState("ok");
            this._errors.textContent = res.referenced.length === 0
                ? "Valid. No secrets referenced."
                : `Valid. References: ${res.referenced.join(", ")}.`;
            this._errors.setAttribute("data-state", "ok");
        } else {
            this._setRulesState("error");
            const e = res.errors[0]!;
            this._errors.textContent = `${e.path}: ${e.message}`;
            this._errors.setAttribute("data-state", "error");
        }
    }

    private _validate = async () => {
        const target = this.getAttribute("target");
        if (!target) return;
        const url = withQuery(`${target}/validate`);

        const rulesText = this._rules.value;
        let rules: unknown;
        try { rules = JSON.parse(rulesText); }
        catch (e) {
            this._showFeedback({ ok: false, errors: [{ path: "$", message: `not valid JSON: ${(e as Error).message}` }] });
            return;
        }

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rules, secrets: this._collectSecrets(), providerId: this._providerId.value || undefined }),
            });
            const body = await res.json() as { ok: true; data: ValidateResponse } | { ok: false; error: { message: string } };
            if ("data" in body) this._showFeedback(body.data);
            else                this._showFeedback({ ok: false, errors: [{ path: "$", message: body.error.message }] });
        } catch (err) {
            this._showFeedback({ ok: false, errors: [{ path: "$", message: `network: ${(err as Error).message}` }] });
        }
    };

    private _onSubmit = async (e: Event) => {
        e.preventDefault();
        const target = this.getAttribute("target");
        const emit   = this.getAttribute("emit");
        if (!target) return;

        let rules: unknown;
        try { rules = JSON.parse(this._rules.value); }
        catch { this._setStatus("Rules JSON is invalid — fix the textarea first.", "error"); return; }

        const payload = {
            providerId: this._providerId.value,
            server:     this._server.value,
            rules,
            secrets:    this._collectSecrets(),
        };
        this._submit.disabled = true;
        this._setStatus("Creating…", null);
        try {
            const res = await fetch(withQuery(target), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const body = await res.json().catch(() => null);
            if (res.ok) {
                this._setStatus("Created.", "ok");
                this._form.reset();
                this._secretsList.innerHTML = "";
                if (emit) document.dispatchEvent(new CustomEvent(emit, { bubbles: true, composed: true, detail: { body } }));
            } else {
                const msg = body?.error?.message ?? `HTTP ${res.status}`;
                this._setStatus(`Error: ${msg}`, "error");
            }
        } catch (err) {
            this._setStatus(`Error: ${(err as Error).message}`, "error");
        } finally {
            this._submit.disabled = false;
        }
    };

    private _setStatus(text: string, state: "ok" | "error" | null) {
        this._status.textContent = text;
        if (state) this._status.setAttribute("data-state", state);
        else       this._status.removeAttribute("data-state");
    }
}

/** Forward `?bucketId=…` (and any other query of the page) onto the target URL. */
function withQuery(target: string): string {
    const url = new URL(target, window.location.href);
    for (const [k, v] of new URLSearchParams(window.location.search)) url.searchParams.append(k, v);
    return url.toString();
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

if (!customElements.get("bsp-proxy-rules-editor")) {
    customElements.define("bsp-proxy-rules-editor", ProxyRulesEditor);
}
