/**
 * `<cms-test-connection target="...">` — wraps a trigger button and
 * overlays the surrounding `<form>` with a state panel during the
 * test. Form data is preserved (the form stays mounted, the overlay
 * sits on top via `position: absolute`).
 *
 * State machine:
 *   idle    → button click → loading
 *   loading → fetch result → success | error
 *   success → 1500ms timeout → idle (form back)
 *   error   → user clicks Back → idle (form back)
 *
 * The overlay is created lazily on first run and reused across runs.
 */

type TestResponse =
    | { ok: true;  endpointCount: number | null }
    | { ok: false; error: string };

export class CmsTestConnection extends HTMLElement {

    private _busy   = false;
    private _form: HTMLFormElement | null = null;
    private _overlay: HTMLElement | null = null;
    private _autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

    private _onClick = async (e: Event) => {
        const trigger = (e.target as HTMLElement).closest('p9r-button, button');
        if (!trigger || !this.contains(trigger)) return;
        if (this._isInsideOverlay(trigger)) return;
        e.preventDefault();
        if (this._busy) return;
        await this._run();
    };

    connectedCallback(): void {
        this.addEventListener('click', this._onClick);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick);
        if (this._autoCloseTimer) clearTimeout(this._autoCloseTimer);
    }

    private async _run(): Promise<void> {
        const target = this.getAttribute('target');
        if (!target) return;

        this._form = this.closest('form') as HTMLFormElement | null;
        if (!this._form) return;

        const overlay = this._ensureOverlay();
        this._busy = true;
        this._showLoading(overlay);

        try {
            const body   = Object.fromEntries(new FormData(this._form).entries());
            const res    = await fetch(target, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
            const result = await res.json() as TestResponse;
            if (result.ok) this._showSuccess(overlay, result.endpointCount);
            else           this._showError  (overlay, result.error);
        } catch (e) {
            this._showError(overlay, e instanceof Error ? e.message : String(e));
        } finally {
            this._busy = false;
        }
    }

    /** Mount the overlay on the native `<form>` itself — `<cms-form>` is
     *  `display: inline` (custom element default) so it can't anchor an
     *  `position: absolute` child. Idempotent. */
    private _ensureOverlay(): HTMLElement {
        if (this._overlay) return this._overlay;
        if (!this._form) throw new Error('cms-test-connection: no form to overlay');

        this._form.style.position = this._form.style.position || 'relative';

        const overlay = document.createElement('div');
        overlay.dataset.role = 'test-overlay';
        overlay.style.cssText = [
            'position: absolute',
            'inset: 0',
            'display: none',
            'align-items: center',
            'justify-content: center',
            'background: var(--bg-surface, #ffffff)',
            'z-index: 5',
            'padding: 1.5rem',
        ].join(';');
        overlay.addEventListener('click', this._onOverlayClick);
        this._form.appendChild(overlay);
        this._overlay = overlay;
        return overlay;
    }

    private _onOverlayClick = (e: Event) => {
        const back = (e.target as HTMLElement).closest('[data-action="test-back"]');
        if (back) {
            e.preventDefault();
            this._hide();
        }
    };

    private _showLoading(overlay: HTMLElement): void {
        if (this._autoCloseTimer) { clearTimeout(this._autoCloseTimer); this._autoCloseTimer = null; }
        overlay.innerHTML = `
            <p9r-stack gap="sm" align="center" justify="center">
                <p9r-spinner></p9r-spinner>
                <p>Testing connection...</p>
            </p9r-stack>
        `;
        overlay.style.display = 'flex';
    }

    private _showSuccess(overlay: HTMLElement, endpointCount: number | null): void {
        const msg = endpointCount === null
            ? 'Reachable — response is not an OpenAPI spec.'
            : `Reachable — ${endpointCount} endpoint${endpointCount === 1 ? '' : 's'} found.`;
        overlay.innerHTML = `
            <p9r-stack gap="sm" align="center" justify="center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                    stroke="var(--success-base, #10b981)" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p><strong>${msg}</strong></p>
            </p9r-stack>
        `;
        overlay.style.display = 'flex';
        this._autoCloseTimer = setTimeout(() => this._hide(), 1500);
    }

    private _showError(overlay: HTMLElement, message: string): void {
        const safe = escapeHtml(message);
        overlay.innerHTML = `
            <p9r-stack gap="md" align="center" justify="center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                    stroke="var(--danger-base, #ef4444)" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p><strong>Connection failed</strong></p>
                <p style="text-align: center; color: var(--text-muted, #94a3b8);">${safe}</p>
                <p9r-button variant="ghost" data-action="test-back">Back</p9r-button>
            </p9r-stack>
        `;
        overlay.style.display = 'flex';
    }

    private _hide(): void {
        if (this._autoCloseTimer) { clearTimeout(this._autoCloseTimer); this._autoCloseTimer = null; }
        if (this._overlay) this._overlay.style.display = 'none';
    }

    private _isInsideOverlay(el: Element): boolean {
        return !!this._overlay && this._overlay.contains(el);
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

customElements.define('cms-test-connection', CmsTestConnection);
