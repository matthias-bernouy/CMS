import { Component, type ComponentMetadata } from 'src/control/core/editorSystem/Component';
import html from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { renderBreadcrumbItem, renderSeparator } from './items';

export type BreadcrumbItem =
    | { type: 'parent'; key: string; label: string }
    | { type: 'current'; label: string }
    | { type: 'ellipsis' };

export type BreadcrumbCallbacks = {
    onPick: (key: string) => void;
    onHover: (key: string, hovered: boolean) => void;
};

const Metadata: ComponentMetadata = { css, template: html as unknown as string };

export class Breadcrumb extends Component {

    private _pill!: HTMLElement;

    constructor() {
        super(Metadata);
        this._pill = this.shadowRoot!.getElementById('pill') as HTMLElement;
    }

    static create(): Breadcrumb {
        return document.createElement('cms-bag-breadcrumb') as Breadcrumb;
    }

    setItems(items: BreadcrumbItem[], cb: BreadcrumbCallbacks): void {
        this._pill.innerHTML = '';
        if (items.length === 0) {
            this.removeAttribute('data-has-items');
            return;
        }
        this.setAttribute('data-has-items', '');
        items.forEach((item, idx) => {
            this._pill.appendChild(renderBreadcrumbItem(item, cb));
            if (idx < items.length - 1) this._pill.appendChild(renderSeparator());
        });
    }

    clear(): void {
        this._pill.innerHTML = '';
        this.removeAttribute('data-has-items');
        this.removeAttribute('data-inline');
    }

    /**
     * If the breadcrumb fits vertically (above or below the BAG), do nothing.
     * Otherwise, switch to an inline-left or inline-right placement.
     */
    refinePosition(barRect: DOMRect): void {
        this.removeAttribute('data-inline');
        if (!this._pill.children.length) return;

        const margin = 4;
        const ownRect = this.getBoundingClientRect();
        if (ownRect.width === 0 && ownRect.height === 0) return;

        const fitsVertically = ownRect.top >= margin
            && ownRect.bottom <= window.innerHeight - margin;
        if (fitsVertically) return;

        const leftSpace = barRect.left - margin;
        const rightSpace = window.innerWidth - barRect.right - margin;
        const side = (leftSpace >= ownRect.width || leftSpace >= rightSpace) ? 'left' : 'right';
        this.setAttribute('data-inline', side);
    }
}

if (!customElements.get('cms-bag-breadcrumb')) {
    customElements.define('cms-bag-breadcrumb', Breadcrumb);
}
