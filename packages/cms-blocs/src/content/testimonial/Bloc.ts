import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    static observedAttributes = ['rating'];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._applyRating();
    }

    attributeChangedCallback() {
        this._applyRating();
    }

    private _applyRating() {
        const rating = Number(this.getAttribute('rating') ?? '0');
        const stars = this.shadowRoot?.querySelectorAll('.star') ?? [];
        stars.forEach((s, i) => (s as HTMLElement).classList.toggle('is-filled', i < rating));
    }

}
