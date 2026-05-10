import { RULE_TEMPLATES } from "@bernouy/cdn-buckets/templates";

/**
 * `<cms-data-provider-rules>` — light-DOM editor for `TDataProvider.rules`
 * + `secrets`. Drop-in replacement for the legacy
 * `<cms-credential-select runtimeAuth.bearer>` + `<cms-headers-input>`
 * pair, switched to the declarative rules DSL shared with cdn-buckets.
 *
 * Renders:
 *   - <textarea name="rules">  — JSON editor, default = empty `{paths:{}}`.
 *     The CMS endpoint `parseRulesAndSecrets` parses the JSON string +
 *     runs the cdn-buckets validator before persisting.
 *   - <fieldset> with one <input name="secrets.<NAME>"> per row, where
 *     <NAME> is live-renamed from the env input as the user types.
 *   - <button type="button"> "+ Add secret".
 *
 * Validation runs on textarea blur OR secret blur via the
 * `validate-url` attribute (POSTs JSON, displays first error). Inputs
 * sit in light DOM so the parent `<cms-form>` picks them up via
 * `new FormData(form)` without any custom serialization.
 *
 * Initial state may be set via the `initial` attribute (JSON string of
 * `{ rules, secrets }`) — used by the edit form to pre-fill from the
 * provider's current values.
 */
export class CmsDataProviderRules extends HTMLElement {

    private _rules!:    HTMLTextAreaElement;
    private _errors!:   HTMLElement;
    private _list!:     HTMLElement;
    private _validateUrl(): string | null { return this.getAttribute("validate-url"); }

    connectedCallback(): void {
        // Idempotent: connectedCallback can fire multiple times; bail if
        // we've already populated.
        if (this.querySelector("textarea")) return;

        const initial = this._readInitial();
        const options = RULE_TEMPLATES
            .map((t, i) => `<option value="${i}">${escapeAttr(t.label)}</option>`)
            .join("");
        this.innerHTML = `
            <style>
                cms-data-provider-rules { display: block; }
                cms-data-provider-rules .ruleslayout {
                    display: grid; gap: 0.85rem;
                }
                cms-data-provider-rules label.dprules-label {
                    display: grid; gap: 0.4rem; font-size: 0.95rem;
                }
                cms-data-provider-rules .template-picker,
                cms-data-provider-rules input,
                cms-data-provider-rules textarea {
                    padding: 0.55rem 0.65rem;
                    font: inherit;
                    font-size: 0.95rem;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                cms-data-provider-rules textarea {
                    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                    font-size: 0.95rem;
                    line-height: 1.45;
                    min-height: 360px;
                    width: 100%; box-sizing: border-box;
                    resize: vertical;
                }
                cms-data-provider-rules .template-hint { color: #666; font-style: italic; min-height: 1em; font-size: 0.85rem; }
                cms-data-provider-rules .errors { font-size: 0.85rem; min-height: 1em; color: #c00; font-family: ui-monospace, monospace; }
                cms-data-provider-rules .errors[data-state="ok"] { color: #047857; }
                cms-data-provider-rules fieldset.secrets {
                    border: 1px solid #e5e7eb; padding: 0.85rem 0.85rem 0.7rem;
                    border-radius: 4px; font-size: 0.95rem;
                }
                cms-data-provider-rules fieldset.secrets legend { padding: 0 0.4rem; font-size: 0.95rem; }
                cms-data-provider-rules .secret-row {
                    display: grid; grid-template-columns: 1fr 1fr auto;
                    gap: 0.5rem; margin-bottom: 0.5rem;
                }
                cms-data-provider-rules .secret-row input { width: 100%; box-sizing: border-box; }
                cms-data-provider-rules .secret-row .remove {
                    background: transparent; border: 1px solid #fca5a5; color: #c00;
                    padding: 0 0.7rem; cursor: pointer; border-radius: 4px; font-size: 1.1rem;
                }
                cms-data-provider-rules .add-secret {
                    background: transparent; border: 1px dashed #9ca3af; color: #374151;
                    padding: 0.45rem 0.7rem; cursor: pointer; border-radius: 4px; font-size: 0.9rem;
                }
            </style>
            <div class="ruleslayout">
                <label class="dprules-label">
                    <span>start from a template</span>
                    <select class="template-picker">
                        <option value="" disabled selected>— pick a starting point —</option>
                        ${options}
                    </select>
                    <small class="template-hint"></small>
                </label>
                <label class="dprules-label">
                    <span>rules <small>(JSON, validated on blur)</small></span>
                    <textarea name="rules" spellcheck="false"></textarea>
                </label>
                <div class="errors" role="status" aria-live="polite"></div>
                <fieldset class="secrets">
                    <legend>secrets <small>(envName → cleartext)</small></legend>
                    <div class="secrets-list"></div>
                    <button type="button" class="add-secret">+ Add secret</button>
                </fieldset>
            </div>`;

        this._rules  = this.querySelector("textarea")!;
        this._errors = this.querySelector(".errors")!;
        this._list   = this.querySelector(".secrets-list")!;
        const picker = this.querySelector(".template-picker") as HTMLSelectElement;
        const hint   = this.querySelector(".template-hint")   as HTMLElement;

        this._rules.value = JSON.stringify(initial.rules, null, 2);
        for (const [k, v] of Object.entries(initial.secrets)) this._addRow(k, v);
        if (Object.keys(initial.secrets).length === 0) this._addRow();

        this._rules.addEventListener("blur", () => void this._validate());
        this.querySelector(".add-secret")!.addEventListener("click", () => this._addRow());
        picker.addEventListener("change", () => this._applyTemplate(Number(picker.value), hint));
    }

    private _applyTemplate(idx: number, hint: HTMLElement): void {
        const tpl = RULE_TEMPLATES[idx];
        if (!tpl) return;
        this._rules.value = JSON.stringify(tpl.rules, null, 2);
        this._list.innerHTML = "";
        for (const [k, v] of Object.entries(tpl.secrets)) this._addRow(k, v);
        if (Object.keys(tpl.secrets).length === 0) this._addRow();
        hint.textContent = tpl.description;
        void this._validate();
    }

    private _readInitial(): { rules: unknown; secrets: Record<string, string> } {
        const raw = this.getAttribute("initial");
        if (!raw) return { rules: { paths: {} }, secrets: {} };
        try {
            const parsed = JSON.parse(raw) as { rules?: unknown; secrets?: Record<string, string> };
            return { rules: parsed.rules ?? { paths: {} }, secrets: parsed.secrets ?? {} };
        } catch {
            return { rules: { paths: {} }, secrets: {} };
        }
    }

    private _addRow(envName = "", value = ""): void {
        const row = document.createElement("div");
        row.className = "secret-row";
        row.innerHTML = `
            <input type="text"     class="env"   placeholder="ENV_NAME" value="${escapeAttr(envName)}">
            <input type="password" class="value" placeholder="cleartext" value="${escapeAttr(value)}">
            <button type="button" class="remove" aria-label="Remove">×</button>`;

        const env = row.querySelector(".env")   as HTMLInputElement;
        const val = row.querySelector(".value") as HTMLInputElement;
        const sync = () => {
            const trimmed = env.value.trim();
            // Empty → no name → FormData skips. Re-typing restores the binding.
            val.name = trimmed ? `secrets.${trimmed}` : "";
        };
        env.addEventListener("input", sync);
        env.addEventListener("blur", () => void this._validate());
        val.addEventListener("blur", () => void this._validate());
        row.querySelector(".remove")!.addEventListener("click", () => { row.remove(); void this._validate(); });
        sync();
        this._list.appendChild(row);
    }

    private async _validate(): Promise<void> {
        const url = this._validateUrl();
        if (!url) return;

        let rules: unknown;
        try { rules = JSON.parse(this._rules.value); }
        catch (e) {
            this._show({ ok: false, errors: [{ path: "$", message: `not valid JSON: ${(e as Error).message}` }] });
            return;
        }

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rules, secrets: this._collectSecrets() }),
            });
            const body = await res.json() as
                | { ok: true;  referenced: string[] }
                | { ok: false; errors: Array<{ path: string; message: string }> };
            this._show(body);
        } catch (err) {
            this._show({ ok: false, errors: [{ path: "$", message: `network: ${(err as Error).message}` }] });
        }
    }

    private _show(res: { ok: true; referenced: string[] } | { ok: false; errors: Array<{ path: string; message: string }> }): void {
        if (res.ok) {
            this._errors.setAttribute("data-state", "ok");
            this._errors.textContent = res.referenced.length === 0
                ? "Valid. No secrets referenced."
                : `Valid. References: ${res.referenced.join(", ")}.`;
        } else {
            this._errors.removeAttribute("data-state");
            const e = res.errors[0]!;
            this._errors.textContent = `${e.path}: ${e.message}`;
        }
    }

    private _collectSecrets(): Record<string, string> {
        const out: Record<string, string> = {};
        for (const row of Array.from(this._list.querySelectorAll(".secret-row"))) {
            const env = (row.querySelector(".env")   as HTMLInputElement).value.trim();
            const val = (row.querySelector(".value") as HTMLInputElement).value;
            if (env) out[env] = val;
        }
        return out;
    }
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

if (!customElements.get("cms-data-provider-rules")) {
    customElements.define("cms-data-provider-rules", CmsDataProviderRules);
}
