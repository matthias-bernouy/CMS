import { Component, type ComponentMetadata } from 'src/control/core/editorSystem/Component';
import { ICON_SNIPPET } from 'src/control/components/icons';
import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import resolveApiUrl from 'src/control/core/dom/meta/resolveApiUrl';

const SnippetMetadata: ComponentMetadata = {
    css: css,
    template: template as unknown as string,
};

/**
 * Custom element that renders a synchronized snippet.
 *
 * In editor mode, the snippet content is SSR-expanded in the light DOM by
 * `expandSnippets()` (see `src/control/server/rendering/expandSnippets.ts`). On upgrade we
 * move that content into the shadow DOM so the ObserverManager (which walks
 * the light DOM) cannot pick it up for inline editing, then we clear the
 * light DOM so that serialization via `EditorManager.getContent()` always
 * produces a reference marker like `<w13c-snippet identifier="hero-v1">`.
 *
 * If the light DOM is empty (newly inserted via BlocLibrary), we fall back
 * to a client-side fetch so the snippet is displayed immediately without
 * requiring a reload.
 *
 * In public mode this file is not bundled — the browser treats `<w13c-snippet>`
 * as a generic unknown element and renders the SSR-expanded inner HTML directly.
 */
export class Snippet extends Component {

    private _root!: HTMLElement;

    constructor() {
        super(SnippetMetadata);
    }

    override connectedCallback() {
        this._root = this.shadowRoot!.querySelector('.snippet-root') as HTMLElement;

        const identifier = this.getAttribute('identifier');
        if (!identifier) {
            this._renderError('Missing identifier attribute');
            return;
        }

        const preExpanded = this.innerHTML.trim();
        if (preExpanded) {
            this._render(preExpanded, identifier);
            this.innerHTML = '';
            return;
        }

        this._renderLoading();
        this._fetch(identifier);
    }

    private async _fetch(identifier: string) {
        try {
            const url = resolveApiUrl('snippet');
            url.searchParams.set('identifier', identifier);

            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(res.status === 404 ? `Snippet "${identifier}" not found` : await res.text());
            }

            const snippet = await res.json();
            this._render(snippet.content, identifier);
        } catch (e: any) {
            this._renderError(e?.message || 'Failed to load snippet');
        }
    }

    private _render(content: string, identifier: string) {
        this._root.innerHTML = `
            <div class="snippet-label">
                ${ICON_SNIPPET}
                <code>${identifier}</code>
            </div>
            <div class="snippet-content">${content}</div>
        `;
    }

    private _renderLoading() {
        this._root.innerHTML = `<div class="snippet-loading">Loading snippet…</div>`;
    }

    private _renderError(msg: string) {
        this._root.innerHTML = `<div class="snippet-error">⚠ ${msg}</div>`;
    }
}

if (!customElements.get('w13c-snippet')) {
    customElements.define('w13c-snippet', Snippet);
}
