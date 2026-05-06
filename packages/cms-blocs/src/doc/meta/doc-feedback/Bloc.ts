import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    private _btnYes: HTMLElement | null = null;
    private _btnNo: HTMLElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._btnYes = this.shadowRoot?.querySelector('.yes') ?? null;
        this._btnNo = this.shadowRoot?.querySelector('.no') ?? null;
        this._btnYes?.addEventListener('click', () => this._vote('yes'));
        this._btnNo?.addEventListener('click', () => this._vote('no'));
    }

    disconnectedCallback(): void {}

    private _vote(value: 'yes' | 'no') {
        this.setAttribute('state', 'thanks');
        this.dispatchEvent(new CustomEvent('doc-feedback', { detail: { value }, bubbles: true, composed: true }));
    }
}
