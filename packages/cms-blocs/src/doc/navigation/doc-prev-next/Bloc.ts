import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    private _prev: HTMLElement | null = null;
    private _next: HTMLElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._prev = this.shadowRoot?.querySelector('.prev') ?? null;
        this._next = this.shadowRoot?.querySelector('.next') ?? null;
        this._prev?.addEventListener('click', this._onPrev);
        this._next?.addEventListener('click', this._onNext);
    }

    disconnectedCallback(): void {
        this._prev?.removeEventListener('click', this._onPrev);
        this._next?.removeEventListener('click', this._onNext);
    }

    private _onPrev = () => this._nav(this.getAttribute('prev-href'));
    private _onNext = () => this._nav(this.getAttribute('next-href'));
    private _nav(href: string | null) { if (href) window.location.href = href; }
}
