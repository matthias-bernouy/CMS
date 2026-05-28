import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    private _list: HTMLElement | null = null;
    private _observer: IntersectionObserver | null = null;
    private _links = new Map<string, HTMLElement>();

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._list = this.shadowRoot?.querySelector('.list') ?? null;
        this._build();
    }

    disconnectedCallback(): void {
        this._observer?.disconnect();
    }

    private _levels(): string {
        const l = this.getAttribute('levels') ?? 'h2-h3';
        if (l === 'h2') return 'h2';
        if (l === 'h2-h4') return 'h2, h3, h4';
        return 'h2, h3';
    }

    private _build() {
        if (!this._list) return;
        const headings = Array.from(document.querySelectorAll(this._levels())) as HTMLElement[];
        this._list.innerHTML = '';
        this._links.clear();
        for (const h of headings) {
            if (!h.id) h.id = (h.textContent ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const li = document.createElement('li');
            li.className = `lvl-${h.tagName.toLowerCase()}`;
            const a = document.createElement('a');
            a.href = `#${h.id}`;
            a.textContent = h.textContent ?? '';
            li.appendChild(a);
            this._list.appendChild(li);
            this._links.set(h.id, a);
        }
        this._observer = new IntersectionObserver(entries => {
            for (const e of entries) {
                const link = this._links.get(e.target.id);
                if (!link) continue;
                if (e.isIntersecting) {
                    this._links.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                }
            }
        }, { rootMargin: '-20% 0% -60% 0%' });
        headings.forEach(h => this._observer?.observe(h));
    }
}
