import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.addEventListener('chip-toggle', this._onChipToggle as EventListener);
    }

    disconnectedCallback(): void {
        this.removeEventListener('chip-toggle', this._onChipToggle as EventListener);
    }

    private _onChipToggle = (e: CustomEvent<{ value: string }>) => {
        const target = e.target as HTMLElement;
        if (this.getAttribute('mode') !== 'multi') {
            // Single selection: clear siblings before letting the chip toggle itself.
            const chips = this.querySelectorAll(':scope > base-chip-toggle, :scope > [slot] base-chip-toggle');
            chips.forEach(c => { if (c !== target) c.removeAttribute('selected'); });
            // Prevent the chip from toggling off when re-clicked in single mode.
            if (target.hasAttribute('selected')) {
                e.preventDefault();
            }
        }
        this._emitChange();
    };

    private _emitChange() {
        // Defer to next frame so chip's own selected attribute is settled.
        requestAnimationFrame(() => {
            const selected = Array.from(this.querySelectorAll('base-chip-toggle[selected]'))
                .map(c => c.getAttribute('value') ?? '');
            this.dispatchEvent(new CustomEvent('change', {
                bubbles: true,
                detail: { values: selected },
            }));
        });
    }
}
