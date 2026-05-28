import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

export class Bloc extends Component {

    static observedAttributes = ['value', 'selected', 'disabled'];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._notify();
    }

    attributeChangedCallback() {
        this._notify();
    }

    private _notify() {
        this.dispatchEvent(new CustomEvent('base-select-option-changed', { bubbles: true, composed: true }));
    }
}
