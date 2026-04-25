import { Component } from "../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Pagination extends Component {

    private _pages: HTMLElement | null;
    private _prev: HTMLButtonElement | null;
    private _next: HTMLButtonElement | null;

    static get observedAttributes() {
        return ['page', 'total', 'siblings', 'boundary'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
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

    attributeChangedCallback(_name: string, _oldVal: string | null, _newVal: string | null) {
        this._render();
    }

    get page(): number { return this._intAttr('page', 1); }
    set page(v: number) { this.setAttribute('page', String(v)); }

    get total(): number { return this._intAttr('total', 1); }
    set total(v: number) { this.setAttribute('total', String(v)); }

    private _intAttr(name: string, fallback: number): number {
        const n = parseInt(this.getAttribute(name) ?? '', 10);
        return Number.isFinite(n) && n > 0 ? n : fallback;
    }

    private _render() {
        if (!this._pages) return;
        const page = this.page;
        const total = this.total;
        const siblings = this._intAttr('siblings', 1);
        const boundary = this._intAttr('boundary', 1);

        this._pages.innerHTML = '';
        for (const item of this._buildItems(page, total, siblings, boundary)) {
            if (item === '…') {
                const span = document.createElement('span');
                span.className = 'ellipsis';
                span.setAttribute('part', 'ellipsis');
                span.textContent = '…';
                this._pages.appendChild(span);
            } else {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'page';
                btn.setAttribute('part', 'page');
                btn.dataset.page = String(item);
                btn.textContent = String(item);
                if (item === page) {
                    btn.setAttribute('aria-current', 'page');
                }
                li.appendChild(btn);
                this._pages.appendChild(li);
            }
        }

        if (this._prev) this._prev.disabled = page <= 1;
        if (this._next) this._next.disabled = page >= total;
    }

    private _buildItems(page: number, total: number, siblings: number, boundary: number): Array<number | '…'> {
        const items: Array<number | '…'> = [];
        const start = Math.max(1, page - siblings);
        const end = Math.min(total, page + siblings);

        const head = Array.from({ length: Math.min(boundary, total) }, (_, i) => i + 1);
        const tail = Array.from({ length: Math.min(boundary, total) }, (_, i) => total - i).reverse();
        const middle: number[] = [];
        for (let i = start; i <= end; i++) middle.push(i);

        const merged = Array.from(new Set([...head, ...middle, ...tail])).sort((a, b) => a - b);
        let prev = 0;
        for (const n of merged) {
            if (prev > 0 && n - prev > 1) items.push('…');
            items.push(n);
            prev = n;
        }
        return items;
    }

    private _onPrev = () => {
        if (this.page <= 1) return;
        this._goto(this.page - 1);
    };

    private _onNext = () => {
        if (this.page >= this.total) return;
        this._goto(this.page + 1);
    };

    private _onPageClick = (e: Event) => {
        const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.page');
        if (!target) return;
        const n = Number(target.dataset.page);
        if (Number.isFinite(n)) this._goto(n);
    };

    private _goto(page: number) {
        if (page === this.page) return;
        const cancelled = !this.dispatchEvent(new CustomEvent('page-change', {
            bubbles: true,
            cancelable: true,
            detail: { page },
        }));
        if (cancelled) return;
        this.setAttribute('page', String(page));
    }
}

if (!customElements.get("p9r-pagination")) {
    customElements.define("p9r-pagination", Pagination);
}
