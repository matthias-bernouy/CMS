import { showToast, type ToastType } from "@bernouy/components";

/**
 * `<cms-event-toast event="provider:synced" message="Provider synced"
 *  type="success">` — listens for a document-level event and pops a
 * toast when it fires. Mount once near the page root.
 *
 * Stateless and inert otherwise — no DOM rendered, no slot.
 */
export class CmsEventToast extends HTMLElement {

    private _attached: string | null = null;
    private _onEvent = () => {
        const message = this.getAttribute('message') ?? '';
        const type    = (this.getAttribute('type') as ToastType | null) ?? 'success';
        if (message) showToast(message, { type });
    };

    connectedCallback(): void {
        this.style.display = 'none';
        const evt = this.getAttribute('event');
        if (!evt) return;
        document.addEventListener(evt, this._onEvent);
        this._attached = evt;
    }

    disconnectedCallback(): void {
        if (this._attached) document.removeEventListener(this._attached, this._onEvent);
        this._attached = null;
    }
}

customElements.define('cms-event-toast', CmsEventToast);
