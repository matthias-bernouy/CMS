import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    static observedAttributes = ['sidebar-open'];

    private _toggle: HTMLButtonElement | null = null;
    private _backdrop: HTMLElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._toggle = this.shadowRoot?.querySelector('.toggle') ?? null;
        this._backdrop = this.shadowRoot?.querySelector('.backdrop') ?? null;
        this._toggle?.addEventListener('click', this._onToggle);
        this._backdrop?.addEventListener('click', this._onClose);
    }

    disconnectedCallback(): void {
        this._toggle?.removeEventListener('click', this._onToggle);
        this._backdrop?.removeEventListener('click', this._onClose);
    }

    private _onToggle = () => {
        if (this.hasAttribute('sidebar-open')) this.removeAttribute('sidebar-open');
        else this.setAttribute('sidebar-open', '');
    };

    private _onClose = () => this.removeAttribute('sidebar-open');
}
