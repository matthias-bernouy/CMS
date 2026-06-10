import { Component } from "@bernouy/components/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import { intAttr } from './compute';
import { renderPagination } from './domain/render';
import { handlePrev, handleNext, handlePageClick } from './listener';

export class Pagination extends Component {

    private _pages: HTMLElement | null;
    private _prev: HTMLButtonElement | null;
    private _next: HTMLButtonElement | null;

    static get observedAttributes() { return ['page', 'total', 'siblings', 'boundary']; }

    constructor() {
        super({ css, template: template as unknown as string });
        this._pages = this.shadowRoot?.querySelector('.pages') ?? null;
        this._prev = this.shadowRoot?.querySelector('.prev') ?? null;
        this._next = this.shadowRoot?.querySelector('.next') ?? null;
    }

    override connectedCallback() {
        this._prev?.addEventListener('click', this._onPrev);
        this._next?.addEventListener('click', this._onNext);
        this._pages?.addEventListener('click', this._onPageClick);
        this._render();
    }

    disconnectedCallback() {
        this._prev?.removeEventListener('click', this._onPrev);
        this._next?.removeEventListener('click', this._onNext);
        this._pages?.removeEventListener('click', this._onPageClick);
    }

    attributeChangedCallback() { this._render(); }

    get page(): number { return intAttr(this, 'page', 1); }
    set page(v: number) { this.setAttribute('page', String(v)); }

    get total(): number { return intAttr(this, 'total', 1); }
    set total(v: number) { this.setAttribute('total', String(v)); }

    private _render() { renderPagination(this, this._pages, this._prev, this._next); }
    private _onPrev = () => handlePrev(this, this.page);
    private _onNext = () => handleNext(this, this.page, this.total);
    private _onPageClick = (e: Event) => handlePageClick(this, this.page, e);
}
