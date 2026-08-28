import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { fetchSecrets, SECRETS_RELOAD_EVENT } from "./actions";
import { SecretConfigureDialog } from "./configureDialog";
import { opDeleteSecret } from "./ops";

/**
 * `<cms-secrets>` — write-only Secrets tab UI. Self-driving: fetches the key list on
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
    private readonly _configureDialog: SecretConfigureDialog;
    private _onReload = () => this._reload();

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        this._configureDialog = new SecretConfigureDialog(this.shadowRoot!, () => this._api);
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
        this._configureDialog.close();
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
            this._list.replaceChildren(...items.map((it) => this._buildRow(it.key)));
            this._empty.hidden = items.length > 0;
        } catch {
            this._empty.hidden = false;
            this._empty.textContent = "Failed to load secrets.";
        }
    }

    private _buildRow(key: string): HTMLElement {
        const frag = this._rowTemplate!.content.cloneNode(true) as DocumentFragment;
        const row = frag.firstElementChild as HTMLElement;
        row.dataset.key = key;
        const keyEl = row.querySelector('[data-role="key"]') as HTMLElement;
        keyEl.textContent = key;
        keyEl.title = key;
        const configure = row.querySelector<HTMLElement>('[data-action="configure"]')!;
        configure.setAttribute("aria-label", `Configure ${key} secret`);
        row.querySelector('[data-action="delete"]')?.setAttribute("aria-label", `Delete ${key} secret`);
        configure.addEventListener("click", () => this._configureDialog.open(key));
        row.querySelector('[data-action="delete"]')?.addEventListener("click", () => opDeleteSecret(this._api, key));
        return row;
    }
}

if (!customElements.get("cms-secrets")) {
    customElements.define("cms-secrets", CmsSecrets);
}
