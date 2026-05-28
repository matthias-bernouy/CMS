import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.addEventListener('click', this._onClick);
        const slot = this.shadowRoot?.getElementById('image-slot') as HTMLSlotElement | null;
        slot?.addEventListener('slotchange', this._onImageSlotChange);
        this._onImageSlotChange();
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick);
        const slot = this.shadowRoot?.getElementById('image-slot') as HTMLSlotElement | null;
        slot?.removeEventListener('slotchange', this._onImageSlotChange);
    }

    private _onImageSlotChange = () => {
        const slot = this.shadowRoot?.getElementById('image-slot') as HTMLSlotElement | null;
        const hasImage = !!slot?.assignedElements().some(el => el.querySelector('img,picture,svg,video') || el.tagName === 'IMG' || el.tagName === 'PICTURE');
        this.toggleAttribute('no-image', !hasImage);
    };

    private _onClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('[slot="actions"]')) return;

        const href = this.getAttribute("href");
        if (!href) return;

        if (this.getAttribute("target") === "_blank") {
            window.open(href, "_blank", "noopener,noreferrer");
        } else {
            window.location.href = href;
        }
    };

}
