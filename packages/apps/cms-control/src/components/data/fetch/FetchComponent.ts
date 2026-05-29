import BubblesEvent from '../../../core/dom/BubblesEvent';
import { collectTemplates, type TemplateMap, type TemplateSlot } from './templates';
import { isEmpty } from './state';
import { runFetch } from './fetcher';
import { stampSiblingsOf, clearStamped } from './stamp';

/**
 * `<cms-fetch url="…">` — fetches JSON and stamps `<template>` siblings.
 * Slots: `default` (required), `loading`, `error`, `empty`.
 * Public `reload()`. Listens on `document` for `cms-fetch:reload` and any
 * name listed in `reload-on` (space-separated).
 */
export class FetchComponent extends HTMLElement {
    static get observedAttributes() { return ['url', 'reload-on']; }

    private _templates: TemplateMap = {};
    private _stamped: Node[] = [];
    private _reloadEvents: string[] = [];
    private _abort: AbortController | null = null;
    private _onReloadEvent = () => { if (this.isConnected) this.reload(); };

    connectedCallback(): void {
        this._refreshReloadListeners();
        document.addEventListener('cms-fetch:reload', this._onReloadEvent);
        if (this._templates.default) { this.reload(); return; }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._init(), { once: true });
        } else {
            this._init();
        }
    }

    disconnectedCallback(): void {
        clearStamped(this._stamped);
        this._stamped = [];
        for (const ev of this._reloadEvents) document.removeEventListener(ev, this._onReloadEvent);
        document.removeEventListener('cms-fetch:reload', this._onReloadEvent);
        this._reloadEvents = [];
        this._abort?.abort();
        this._abort = null;
    }

    attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
        if (oldVal === newVal) return;
        if (name === 'reload-on') { this._refreshReloadListeners(); return; }
        if (this.isConnected) this.reload();
    }

    reload(): void { this._run(); }

    private _init(): void {
        this._templates = collectTemplates(this);
        if (!this._templates.default) {
            console.warn('cms-fetch: missing <template> child (default slot)');
            return;
        }
        this.reload();
    }

    private _refreshReloadListeners(): void {
        for (const ev of this._reloadEvents) document.removeEventListener(ev, this._onReloadEvent);
        this._reloadEvents = (this.getAttribute('reload-on') || '').split(/\s+/).filter(Boolean);
        for (const ev of this._reloadEvents) document.addEventListener(ev, this._onReloadEvent);
    }

    private async _run(): Promise<void> {
        const urlAttr = this.getAttribute('url');
        if (!urlAttr || !this._templates.default) return;

        this._abort?.abort();
        this._abort = new AbortController();
        const signal = this._abort.signal;

        this._renderSlot('loading', null);
        this.dispatchEvent(new BubblesEvent('fetch:loading'));

        const outcome = await runFetch(urlAttr, signal);
        if (signal.aborted || outcome.kind === 'aborted') return;

        if (outcome.kind === 'success') {
            const slot: TemplateSlot = isEmpty(outcome.data) && this._templates.empty ? 'empty' : 'default';
            this._renderSlot(slot, outcome.data);
            this.dispatchEvent(new CustomEvent('fetch:data', { bubbles: true, composed: true, detail: outcome.data }));
        } else {
            this._renderSlot('error', outcome.error);
            this.dispatchEvent(new CustomEvent('fetch:error', { bubbles: true, composed: true, detail: outcome.error }));
        }
    }

    private _renderSlot(slot: TemplateSlot, context: unknown): void {
        const tpl = this._templates[slot];
        if (!tpl) return;
        this._stamped = stampSiblingsOf(this, tpl, context, this._stamped);
    }
}

customElements.define('cms-fetch', FetchComponent);
