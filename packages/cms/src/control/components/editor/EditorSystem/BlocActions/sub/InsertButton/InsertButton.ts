import { Component, type ComponentMetadata } from 'src/control/core/editorSystem/Component';
import html from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export type InsertButtonPosition = 'before' | 'after';

const Metadata: ComponentMetadata = {
    css,
    template: html as unknown as string,
};

export class InsertButton extends Component {

    constructor() {
        super(Metadata);
        this.shadowRoot!.querySelector('.btn')!.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('insert-pick', { bubbles: true, composed: true }));
        });
    }

    static create(position: InsertButtonPosition, onPick: () => void): InsertButton {
        const btn = document.createElement('cms-bag-insert-button') as InsertButton;
        btn.dataset.position = position;
        btn.addEventListener('insert-pick', onPick);
        return btn;
    }

    setVisible(visible: boolean) {
        this.toggleAttribute('data-visible', visible);
    }

    setInline(inline: boolean) {
        this.toggleAttribute('data-inline', inline);
    }

    setLocation(left: number, top: number) {
        this.style.left = `${left}px`;
        this.style.top = `${top}px`;
    }
}

if (!customElements.get('cms-bag-insert-button')) {
    customElements.define('cms-bag-insert-button', InsertButton);
}
