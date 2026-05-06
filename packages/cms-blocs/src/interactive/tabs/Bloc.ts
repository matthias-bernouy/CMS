import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    private _triggers: HTMLElement | null = null;
    private _indicator: HTMLElement | null = null;
    private _slotEl: HTMLSlotElement | null = null;
    private _resizeObs: ResizeObserver | null = null;
    private _mutationObs: MutationObserver | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._triggers = this.shadowRoot?.querySelector('.triggers') ?? null;
        this._indicator = this.shadowRoot?.querySelector('.indicator') ?? null;
        this._slotEl = this.shadowRoot?.querySelector('.panels slot') ?? null;

        this._slotEl?.addEventListener('slotchange', this._rebuild);
        this._triggers?.addEventListener('click', this._onTriggerClick);
        this._triggers?.addEventListener('keydown', this._onKey);

        this._resizeObs = new ResizeObserver(() => this._moveIndicator());
        if (this._triggers) this._resizeObs.observe(this._triggers);

        // Watch label text changes inside child base-tab elements.
        this._mutationObs = new MutationObserver(this._rebuild);
        this._mutationObs.observe(this, { subtree: true, childList: true, characterData: true });

        this._rebuild();
    }

    disconnectedCallback(): void {
        this._slotEl?.removeEventListener('slotchange', this._rebuild);
        this._triggers?.removeEventListener('click', this._onTriggerClick);
        this._triggers?.removeEventListener('keydown', this._onKey);
        this._resizeObs?.disconnect();
        this._mutationObs?.disconnect();
    }

    private _items(): HTMLElement[] {
        return Array.from(this.querySelectorAll(':scope > base-tab')) as HTMLElement[];
    }

    private _labelOf(item: HTMLElement, index: number): string {
        const el = item.querySelector(':scope > [slot="label"]');
        const text = el?.textContent?.trim();
        return text && text.length > 0 ? text : `Tab ${index + 1}`;
    }

    private _rebuild = () => {
        if (!this._triggers) return;
        const items = this._items();
        const currentActive = items.findIndex(it => it.hasAttribute('active'));
        this._triggers.replaceChildren(...items.map((item, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'trigger';
            btn.setAttribute('role', 'tab');
            btn.dataset.index = String(i);
            btn.textContent = this._labelOf(item, i);
            return btn;
        }));
        if (currentActive < 0 && items[0]) items[0].setAttribute('active', '');
        this._syncActive();
        requestAnimationFrame(() => this._moveIndicator());
    };

    private _syncActive() {
        const items = this._items();
        const triggers = Array.from(this._triggers?.children ?? []) as HTMLElement[];
        items.forEach((item, i) => {
            const active = item.hasAttribute('active');
            triggers[i]?.classList.toggle('is-active', active);
            triggers[i]?.setAttribute('aria-selected', active ? 'true' : 'false');
            triggers[i]?.setAttribute('tabindex', active ? '0' : '-1');
        });
    }

    private _activate(index: number) {
        const items = this._items();
        if (index < 0 || index >= items.length) return;
        items.forEach((item, i) => item.toggleAttribute('active', i === index));
        this._syncActive();
        this._moveIndicator();
        (this._triggers?.children[index] as HTMLElement)?.focus();
    }

    private _onTriggerClick = (e: Event) => {
        const t = (e.target as HTMLElement).closest('.trigger') as HTMLElement | null;
        if (!t) return;
        this._activate(Number(t.dataset.index));
    };

    private _onKey = (e: KeyboardEvent) => {
        const triggers = Array.from(this._triggers?.children ?? []) as HTMLElement[];
        const current = triggers.findIndex(t => t.classList.contains('is-active'));
        if (e.key === 'ArrowRight') { e.preventDefault(); this._activate((current + 1) % triggers.length); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); this._activate((current - 1 + triggers.length) % triggers.length); }
        else if (e.key === 'Home') { e.preventDefault(); this._activate(0); }
        else if (e.key === 'End') { e.preventDefault(); this._activate(triggers.length - 1); }
    };

    private _moveIndicator() {
        if (!this._indicator || !this._triggers) return;
        const active = this._triggers.querySelector('.is-active') as HTMLElement | null;
        if (!active) { this._indicator.style.opacity = '0'; return; }
        this._indicator.style.opacity = '1';
        this._indicator.style.transform = `translateX(${active.offsetLeft}px)`;
        this._indicator.style.width = `${active.offsetWidth}px`;
    }

}
