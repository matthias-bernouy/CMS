import BubblesEvent from "cms-control/core/dom/BubblesEvent";
import { showToast } from "@bernouy/components";

/**
 * `<cms-confirm-form target="..." method="DELETE" emit="..." message="..."
 *  conflict-confirm-message="...">` — a self-contained click→confirm→fetch
 * helper. Handles destructive actions that need an explicit confirmation step
 * with optional consumer-aware second-confirm.
 *
 * Flow:
 *  1. Click on any descendant element → native `confirm(message)`
 *  2. If accepted → fetch `target` with `method`
 *  3. On 200 → emit success event (`emit` attribute) on document, toast
 *  4. On 409 → parse JSON body for consumer lists, build a multi-line
 *     follow-up confirm including those, retry with `?force=true`
 *  5. On other failures → toast the error
 */
export class CmsConfirmForm extends HTMLElement {

    private _busy = false;

    private _onClick = async (e: Event) => {
        const trigger = (e.target as HTMLElement).closest('p9r-button, button');
        if (!trigger || !this.contains(trigger)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (this._busy) return;
        const message = this.getAttribute('message') || 'Are you sure?';
        if (!confirm(message)) return;
        this._busy = true;
        try { await this._submit(false); }
        finally { this._busy = false; }
    };

    connectedCallback(): void {
        // Capture phase so the click never reaches inner form handlers.
        this.addEventListener('click', this._onClick, true);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick, true);
    }

    private async _submit(force: boolean): Promise<void> {
        const target = this.getAttribute('target');
        const method = this.getAttribute('method') || 'POST';
        if (!target) { showToast('cms-confirm-form: missing target', { type: 'error' }); return; }

        const url = force ? withForce(target) : target;
        let res: Response;
        try { res = await fetch(url, { method }); }
        catch (e) { showToast(`Request failed: ${e instanceof Error ? e.message : String(e)}`, { type: 'error' }); return; }

        if (res.ok) { this._onSuccess(); return; }

        if (res.status === 409 && !force) {
            const body = await res.json().catch(() => ({}));
            const followUp = formatConflict(body);
            const followMessage = this.getAttribute('conflict-confirm-message') || 'Proceed anyway?';
            if (confirm(`${body.error ?? 'Conflict'}\n\n${followUp}\n\n${followMessage}`)) {
                await this._submit(true);
            }
            return;
        }

        // Prefer the server's explicit `{ error }` message; fall back to raw
        // text, then to the bare status — never show an opaque "HTTP 500".
        const text = await res.text().catch(() => '');
        let message = text;
        try { const body = JSON.parse(text); if (body?.error) message = body.error; } catch { /* not JSON */ }
        showToast(message || `HTTP ${res.status}`, { type: 'error' });
    }

    private _onSuccess(): void {
        const emit = this.getAttribute('emit');
        if (emit) document.dispatchEvent(new BubblesEvent(emit));
        // `redirect` is for actions that invalidate the current view/session
        // (e.g. deleting your own account) — navigate instead of reloading.
        const redirect = this.getAttribute('redirect');
        if (redirect) window.location.href = redirect;
    }
}

function withForce(target: string): string {
    return target + (target.includes('?') ? '&' : '?') + 'force=true';
}

/**
 * Compose a human-readable list of consumer names from a 409 response body
 * shaped like `{ pages: [{path,title}], templates: [{identifier,name}],
 * snippets: [{identifier,name}] }`. Returns an empty string when nothing
 * matches so the caller doesn't have to special-case.
 */
function formatConflict(body: any): string {
    const lines: string[] = [];
    const pages     = Array.isArray(body?.pages)     ? body.pages     : [];
    const templates = Array.isArray(body?.templates) ? body.templates : [];
    const snippets  = Array.isArray(body?.snippets)  ? body.snippets  : [];
    if (pages.length) {
        lines.push('Pages:');
        for (const p of pages) lines.push(`  • ${p.title || p.path}`);
    }
    if (templates.length) {
        if (lines.length) lines.push('');
        lines.push('Templates:');
        for (const t of templates) lines.push(`  • ${t.name || t.identifier}`);
    }
    if (snippets.length) {
        if (lines.length) lines.push('');
        lines.push('Snippets:');
        for (const s of snippets) lines.push(`  • ${s.name || s.identifier}`);
    }
    return lines.join('\n');
}

customElements.define('cms-confirm-form', CmsConfirmForm);
