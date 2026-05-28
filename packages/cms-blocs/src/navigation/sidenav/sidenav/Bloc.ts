import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._menuToggle = this.shadowRoot?.querySelector('.menu-toggle') as HTMLButtonElement | null;
        this._desktopToggle = this.shadowRoot?.querySelector('.desktop-toggle') as HTMLButtonElement | null;
        this._backdrop = this.shadowRoot?.querySelector('.backdrop') as HTMLElement | null;

        this._menuToggle?.removeEventListener('click', this._onMenuClick);
        this._desktopToggle?.removeEventListener('click', this._onDesktopClick);
        this._backdrop?.removeEventListener('click', this._onBackdropClick);
        document.removeEventListener('keydown', this._onKeyDown);

        this._menuToggle?.addEventListener('click', this._onMenuClick);
        this._desktopToggle?.addEventListener('click', this._onDesktopClick);
        this._backdrop?.addEventListener('click', this._onBackdropClick);
        document.addEventListener('keydown', this._onKeyDown);

        this._syncAria();
    }

    disconnectedCallback(): void {
        this._menuToggle?.removeEventListener('click', this._onMenuClick);
        this._desktopToggle?.removeEventListener('click', this._onDesktopClick);
        this._backdrop?.removeEventListener('click', this._onBackdropClick);
        document.removeEventListener('keydown', this._onKeyDown);
        this._menuToggle = null;
        this._desktopToggle = null;
        this._backdrop = null;
    }

    static observedAttributes = ['open', 'collapsed'];

    attributeChangedCallback(): void {
        this._syncAria();
    }

    private _menuToggle: HTMLButtonElement | null = null;
    private _desktopToggle: HTMLButtonElement | null = null;
    private _backdrop: HTMLElement | null = null;

    private _onMenuClick = () => {
        this.toggleAttribute('open');
    }

    private _onBackdropClick = () => {
        this.removeAttribute('open');
    }

    private _onDesktopClick = () => {
        this.toggleAttribute('collapsed');
    }

    private _onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.hasAttribute('open')) {
            this.removeAttribute('open');
        }
    }

    private _syncAria(): void {
        this._menuToggle?.setAttribute('aria-expanded', String(this.hasAttribute('open')));
        this._desktopToggle?.setAttribute('aria-expanded', String(!this.hasAttribute('collapsed')));
    }

}
