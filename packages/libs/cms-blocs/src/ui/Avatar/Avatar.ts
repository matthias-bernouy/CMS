import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Avatar extends Component {

    private _img: HTMLImageElement | null;
    private _initials: HTMLElement | null;

    static get observedAttributes() {
        return ['src', 'alt', 'name', 'initials'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._img = this.shadowRoot?.querySelector('.image') ?? null;
        this._initials = this.shadowRoot?.querySelector('.initials') ?? null;
    }

    override connectedCallback() {
        if (this._img) this._img.addEventListener('error', this._handleImageError);
        this._syncImage();
        this._syncInitials();
    }

    disconnectedCallback() {
        if (this._img) this._img.removeEventListener('error', this._handleImageError);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (name === 'src' || name === 'alt') this._syncImage();
        if (name === 'name' || name === 'initials') this._syncInitials();
    }

    private _syncImage() {
        if (!this._img) return;
        const src = this.getAttribute('src');
        const alt = this.getAttribute('alt') ?? this.getAttribute('name') ?? '';
        if (src) {
            this._img.src = src;
            this._img.alt = alt;
            this._img.hidden = false;
        } else {
            this._img.hidden = true;
            this._img.removeAttribute('src');
        }
    }

    private _syncInitials() {
        if (!this._initials) return;
        const explicit = this.getAttribute('initials');
        if (explicit) {
            this._initials.textContent = explicit;
            return;
        }
        const name = this.getAttribute('name');
        if (!name) {
            this._initials.textContent = '';
            return;
        }
        this._initials.textContent = name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(p => p[0])
            .join('')
            .toUpperCase();
    }

    private _handleImageError = () => {
        if (this._img) this._img.hidden = true;
    };
}
