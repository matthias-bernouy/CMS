import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { fetchSecrets, SECRETS_RELOAD_EVENT } from "./actions";
import { injectIcons } from "./icons";
import { opSaveRow, opDeleteSecret } from "./ops";

/**
 * `<cms-secrets>` — Secrets tab UI. Self-driving: fetches the list on
 * connect, re-fetches on `secret:saved` (own + external). Per-operation
 * UI (validation, toasts) lives in `ops.ts`; lifecycle + DOM wiring stay
 * here.
 *
 * Customizable via the `api` attribute (default `/api/secrets`) so admin
 * pages mounted under a runner-scoped basePath pass the correct URL.
 */
export class CmsSecrets extends Component {
    private _list: HTMLElement | null = null;
    private _rowTemplate: HTMLTemplateElement | null = null;
    private _empty: HTMLElement | null = null;
    private _onReload = () => this._reload();

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const sr = this.shadowRoot!;
        this._list = sr.querySelector('[data-role="list"]') as HTMLElement;
        this._empty = sr.querySelector('[data-role="empty"]') as HTMLElement;
        this._rowTemplate = sr.querySelector('[data-role="row-template"]') as HTMLTemplateElement;
        document.addEventListener(SECRETS_RELOAD_EVENT, this._onReload);
        this._reload();
    }

    disconnectedCallback(): void {
        document.removeEventListener(SECRETS_RELOAD_EVENT, this._onReload);
    }

    private get _api(): string {
        return this.getAttribute("api") ?? "/api/secrets";
    }

    private async _reload(): Promise<void> {
        if (!this._list || !this._empty) {
            return;
        }
        try {
            const items = await fetchSecrets(this._api);
            items.sort((a, b) => a.key.localeCompare(b.key));
            this._list.replaceChildren(...items.map((it) => this._buildRow(it.key, it.value)));
            this._empty.hidden = items.length > 0;
        } catch {
            this._empty.hidden = false;
            this._empty.textContent = "Failed to load secrets.";
        }
    }

    private _buildRow(key: string, value: string): HTMLElement {
        const frag = this._rowTemplate!.content.cloneNode(true) as DocumentFragment;
        const row = frag.firstElementChild as HTMLElement;
        row.dataset.key = key;
        const keyEl = row.querySelector('[data-role="key"]') as HTMLElement;
        keyEl.textContent = key;
        keyEl.title = key;
        const input = row.querySelector('[data-role="value"]') as HTMLElement & { value: string };
        input.setAttribute("aria-label", `Value for ${key}`);
        input.value = value;
        for (const action of ["reveal", "save", "delete"] as const) {
            row.querySelector(`[data-action="${action}"]`)?.setAttribute("aria-label", `${action} ${key} secret`);
        }
        injectIcons(row);
        row.querySelector('[data-action="reveal"]')?.addEventListener("click", () => this._toggleReveal(row));
        row.querySelector('[data-action="save"]')?.addEventListener("click", () => this._save(row));
        row.querySelector('[data-action="delete"]')?.addEventListener("click", () => opDeleteSecret(this._api, key));
        return row;
    }

    private _toggleReveal(row: HTMLElement): void {
        const input = row.querySelector('[data-role="value"]') as HTMLElement;
        const cur = input.getAttribute("type") ?? "password";
        input.setAttribute("type", cur === "password" ? "text" : "password");
    }

    private _save(row: HTMLElement): Promise<void> {
        const key = row.dataset.key!;
        const value = (row.querySelector('[data-role="value"]') as HTMLInputElement).value;
        return opSaveRow(this._api, key, value);
    }
}

if (!customElements.get("cms-secrets")) {
    customElements.define("cms-secrets", CmsSecrets);
}
