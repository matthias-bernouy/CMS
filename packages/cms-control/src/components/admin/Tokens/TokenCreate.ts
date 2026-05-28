import { showToast } from "cms-control/core/showToast";

/**
 * `<cms-token-create api emit>` — the "new token" modal body. Two states in
 * light DOM (so the design-system `p9r-*` elements style themselves): a name
 * form, then a one-time reveal of the minted token (shown ONCE — only its hash
 * is stored server-side). On success it fires `emit` so the tokens table
 * refreshes, and resets whenever its host `<p9r-modal>` is reopened.
 *
 * It deliberately does NOT use `<cms-form>`: that emits `form:success`, which
 * `<p9r-modal>` listens for to auto-close — but the reveal must stay open.
 */
class CmsTokenCreate extends HTMLElement {

    private _token = "";

    connectedCallback() {
        this.innerHTML = TEMPLATE;
        this._q('[data-role="create"]').addEventListener("click", () => this._create());
        this._q('[data-role="copy"]').addEventListener("click", () => this._copy());
        this._q('[data-role="done"]').addEventListener("click", () => this._close());
        this.closest("p9r-modal")?.addEventListener("open", () => this._reset());
    }

    private _q(sel: string) { return this.querySelector(sel) as HTMLElement; }
    private get _api()  { return this.getAttribute("api")  ?? "/api/pats"; }
    private get _emit() { return this.getAttribute("emit") ?? "pat:changed"; }

    private async _create() {
        const input = this._q('[data-role="name"]') as HTMLElement & { value: string };
        const name = (input.value ?? "").trim();
        if (!name) { input.setAttribute("invalid", ""); (input as unknown as HTMLElement).focus?.(); return; }
        input.removeAttribute("invalid");

        const btn = this._q('[data-role="create"]');
        btn.setAttribute("disabled", "");
        try {
            const res = await fetch(this._api, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
            });
            if (!res.ok) { showToast("Could not create token", { type: "error" }); return; }
            const { token } = await res.json() as { token: string };
            this._token = token;
            (this._q('[data-role="token"]') as HTMLElement & { value: string }).value = token;
            this._q('[data-role="form"]').hidden = true;
            this._q('[data-role="reveal"]').hidden = false;
            document.dispatchEvent(new Event(this._emit, { bubbles: true }));
        } catch {
            showToast("Network error", { type: "error" });
        } finally {
            btn.removeAttribute("disabled");
        }
    }

    private _copy() {
        navigator.clipboard?.writeText(this._token);
        showToast("Token copied", { type: "success" });
    }

    private _reset() {
        this._token = "";
        (this._q('[data-role="name"]') as HTMLElement & { value: string }).value = "";
        this._q('[data-role="form"]').hidden = false;
        this._q('[data-role="reveal"]').hidden = true;
    }

    private _close() {
        this._reset();
        this.closest("p9r-modal")?.removeAttribute("open");
    }
}

const TEMPLATE = `
<div data-role="form">
  <p9r-stack gap="md">
    <p9r-input data-role="name" name="name" label="Token name" placeholder="my laptop CLI"></p9r-input>
    <p9r-button data-role="create" color="primary" fullWidth>Create token</p9r-button>
  </p9r-stack>
</div>
<div data-role="reveal" hidden>
  <p9r-stack gap="md">
    <p9r-alert type="warning">
      <span slot="title">Copy this token now</span>
      It won't be shown again.
    </p9r-alert>
    <p9r-input data-role="token" label="Token"></p9r-input>
    <p9r-stack direction="row" gap="sm" justify="end">
      <p9r-button data-role="copy" variant="outlined">Copy</p9r-button>
      <p9r-button data-role="done" color="primary">Done</p9r-button>
    </p9r-stack>
  </p9r-stack>
</div>`;

customElements.define("cms-token-create", CmsTokenCreate);
