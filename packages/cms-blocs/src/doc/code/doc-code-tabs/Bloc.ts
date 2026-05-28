import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    private _slot: HTMLSlotElement | null = null;
    private _tabs: HTMLElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._slot = this.shadowRoot?.querySelector('slot') ?? null;
        this._tabs = this.shadowRoot?.querySelector('.tabs') ?? null;
        this._slot?.addEventListener('slotchange', this._onChange);
        this._tabs?.addEventListener('click', this._onTabClick);
        this._onChange();
    }

    disconnectedCallback(): void {
        this._slot?.removeEventListener('slotchange', this._onChange);
        this._tabs?.removeEventListener('click', this._onTabClick);
    }

    private _onChange = () => {
        if (!this._tabs) return;
        const children = (this._slot?.assignedElements() ?? []) as HTMLElement[];
        this._tabs.innerHTML = '';
        children.forEach((el, i) => {
            const label = el.getAttribute('filename') || el.getAttribute('language') || `Tab ${i + 1}`;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tab';
            btn.dataset.index = String(i);
            btn.textContent = label;
            if (i === 0) btn.classList.add('active');
            this._tabs!.appendChild(btn);
            el.style.display = i === 0 ? '' : 'none';
        });
    };

    private _onTabClick = (e: Event) => {
        const btn = (e.target as HTMLElement).closest('.tab') as HTMLElement | null;
        if (!btn) return;
        const idx = Number(btn.dataset.index);
        this._tabs?.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const children = (this._slot?.assignedElements() ?? []) as HTMLElement[];
        children.forEach((el, i) => { el.style.display = i === idx ? '' : 'none'; });
    };
}
