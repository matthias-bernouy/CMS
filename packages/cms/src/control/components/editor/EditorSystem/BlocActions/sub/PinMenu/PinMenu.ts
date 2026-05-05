import { Component, type ComponentMetadata } from 'src/control/core/editorSystem/Component';
import { ICON_PIN } from '../../../../../icons';
import html from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export type PinMenuItem = {
    label: string;
    isPinned: boolean;
    onToggle: () => void;
};

const Metadata: ComponentMetadata = {
    css,
    template: html as unknown as string,
};

export class PinMenu extends Component {

    private _items!: HTMLElement;

    constructor() {
        super(Metadata);
        this._items = this.shadowRoot!.getElementById('items') as HTMLElement;
    }

    static create(items: PinMenuItem[]): PinMenu {
        const menu = document.createElement('cms-bag-pin-menu') as PinMenu;
        menu.setItems(items);
        return menu;
    }

    setItems(items: PinMenuItem[]): void {
        this._items.innerHTML = '';
        for (const item of items) {
            this._items.appendChild(this._renderItem(item));
        }
    }

    setPosition(left: number, top: number): void {
        this.style.left = `${left}px`;
        this.style.top = `${top}px`;
    }

    private _renderItem(item: PinMenuItem): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'item';
        btn.innerHTML = `<span class="icon">${ICON_PIN}</span><span class="label"></span>`;
        (btn.querySelector('.label') as HTMLElement).textContent = item.label;

        const setActive = () => btn.toggleAttribute('data-active', item.isPinned);
        setActive();

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            item.onToggle();
            setActive();
        });

        return btn;
    }
}

if (!customElements.get('cms-bag-pin-menu')) {
    customElements.define('cms-bag-pin-menu', PinMenu);
}
