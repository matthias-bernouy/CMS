import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Accordion extends Component {

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }

    override connectedCallback() {
        this.addEventListener('accordion-item-toggle', this._handleItemToggle as EventListener);
    }

    disconnectedCallback() {
        this.removeEventListener('accordion-item-toggle', this._handleItemToggle as EventListener);
    }

    private _items(): HTMLElement[] {
        return Array.from(this.querySelectorAll('p9r-accordion-item')) as HTMLElement[];
    }

    private _handleItemToggle = (e: CustomEvent<{ open: boolean }>) => {
        if (this.hasAttribute('multiple')) return;
        if (!e.detail.open) return;
        const target = e.target as HTMLElement;
        for (const item of this._items()) {
            if (item !== target) item.removeAttribute('open');
        }
    };
}
