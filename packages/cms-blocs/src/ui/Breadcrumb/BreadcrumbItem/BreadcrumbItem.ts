import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class BreadcrumbItem extends Component {

    private _link: HTMLAnchorElement | null;

    static get observedAttributes() {
        return ['href', 'current'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._link = this.shadowRoot?.querySelector('.link') ?? null;
    }

    override connectedCallback() {
        this._syncHref();
        this._syncCurrent();
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (name === 'href') this._syncHref();
        if (name === 'current') this._syncCurrent();
    }

    private _syncHref() {
        if (!this._link) return;
        const href = this.getAttribute('href');
        if (href) this._link.setAttribute('href', href);
        else this._link.removeAttribute('href');
    }

    private _syncCurrent() {
        if (!this._link) return;
        if (this.hasAttribute('current')) this._link.setAttribute('aria-current', 'page');
        else this._link.removeAttribute('aria-current');
    }
}
