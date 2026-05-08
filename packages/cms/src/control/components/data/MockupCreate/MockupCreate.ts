import BubblesEvent from "src/control/core/dom/BubblesEvent";
import { buildRequestUrl } from "src/control/core/dom/buildRequestUrl";

type ResponseChoice = {
    status:      string;
    description: string;
    defaultBody: string;
};

/**
 * `<cms-mockup-create></cms-mockup-create>`
 *
 * Self-contained mockup-creation form. Reads `id`, `method` and `path`
 * from `window.location.search` (the provider detail page carries them
 * in its URL), fetches the endpoint detail and populates:
 *   - the HTTP-status `<p9r-select>` from the spec's declared responses
 *   - the body `<p9r-textarea>` from the picked status's `example` or a
 *     schema stub, regenerated whenever the status changes
 *
 * On submit, POSTs `{ name, status, body }` to
 * `/api/data/provider/mockup` with `id`/`method`/`path` forwarded as
 * query params (server reads them either from query or body). Dispatches
 * `mockup:created` (so the list refreshes) and `form:success` (so the
 * surrounding `<p9r-modal>` auto-closes) on 2xx; `form:failed` otherwise.
 */
export class MockupCreate extends HTMLElement {

    private _responses: ResponseChoice[] = [];
    private _statusEl: HTMLElement & { value: string } | null = null;
    private _bodyEl:   HTMLElement & { value: string } | null = null;

    connectedCallback(): void {
        this.innerHTML = TEMPLATE;
        const form = this.querySelector("form") as HTMLFormElement;
        this._statusEl = this.querySelector('p9r-select[name="status"]') as HTMLElement & { value: string };
        this._bodyEl   = this.querySelector('p9r-textarea[name="body"]') as HTMLElement & { value: string };

        form.addEventListener("submit", e => this._onSubmit(e));
        this._statusEl?.addEventListener("change", () => this._syncBody());

        this._loadEndpoint().catch(() => this._fallback());
    }

    private async _loadEndpoint(): Promise<void> {
        const params = new URLSearchParams(window.location.search);
        if (!params.get("id") || !params.get("method") || !params.get("path")) {
            this._fallback();
            return;
        }
        const url = buildRequestUrl("/api/data/provider/endpoint");
        const res = await fetch(url);
        if (!res.ok) { this._fallback(); return; }
        const data = await res.json() as { responses?: ResponseChoice[] };
        this._responses = Array.isArray(data.responses) && data.responses.length > 0
            ? data.responses
            : [{ status: "200", description: "", defaultBody: "{}" }];
        this._renderStatusOptions();
        this._syncBody();
    }

    private _fallback(): void {
        this._responses = [{ status: "200", description: "", defaultBody: "{}" }];
        this._renderStatusOptions();
        this._syncBody();
    }

    private _renderStatusOptions(): void {
        if (!this._statusEl) return;
        this._statusEl.innerHTML = this._responses
            .map(r => `<option value="${escapeAttr(r.status)}">${escapeAttr(r.status)}${r.description ? " — " + escapeAttr(r.description) : ""}</option>`)
            .join("");
    }

    private _syncBody(): void {
        if (!this._statusEl || !this._bodyEl) return;
        const value  = this._statusEl.value || this._responses[0]?.status || "200";
        const picked = this._responses.find(r => r.status === value) ?? this._responses[0];
        if (picked) this._bodyEl.value = picked.defaultBody;
    }

    private async _onSubmit(e: Event): Promise<void> {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const data = Object.fromEntries(new FormData(form).entries());
        const url  = buildRequestUrl("/api/data/provider/mockup");
        try {
            const res = await fetch(url.toString(), {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(data),
            });
            if (!res.ok) { this.dispatchEvent(new BubblesEvent("form:failed")); return; }
            form.reset();
            this.dispatchEvent(new BubblesEvent("form:success"));
            document.dispatchEvent(new BubblesEvent("mockup:created"));
        } catch {
            this.dispatchEvent(new BubblesEvent("form:failed"));
        }
    }
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TEMPLATE = `
<form>
    <p9r-stack gap="md">
        <p9r-input name="name" label="Name" placeholder="default" required></p9r-input>
        <p9r-select name="status" label="HTTP status"></p9r-select>
        <p9r-textarea name="body" rows="14" autosize label="Body (JSON)"></p9r-textarea>
        <p9r-button color="primary" fullWidth type="submit">Create</p9r-button>
    </p9r-stack>
</form>
`;

customElements.define("cms-mockup-create", MockupCreate);
