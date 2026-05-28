import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    static observedAttributes = ['href', 'auto-active'];

    private _anchor: HTMLAnchorElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._anchor = this.shadowRoot?.querySelector('a') ?? null;
        this._syncHref();
        this._syncActive();
    }

    attributeChangedCallback() {
        this._syncHref();
        this._syncActive();
    }

    private _syncHref() {
        const href = this.getAttribute('href') ?? '#';
        this._anchor?.setAttribute('href', href);
    }

    private _syncActive() {
        if (this.getAttribute('auto-active') === 'false') return;
        const href = this.getAttribute('href');
        if (!href) return;
        try {
            const url = new URL(href, window.location.origin);
            if (url.pathname === window.location.pathname) this.setAttribute('active', '');
            else this.removeAttribute('active');
        } catch {}
    }
}
