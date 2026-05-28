import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    static observedAttributes = ["href"];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._syncHref();
    }

    attributeChangedCallback(name: string) {
        if (name === "href") this._syncHref();
    }

    private _syncHref() {
        const anchor = this.shadowRoot!.querySelector("a");
        anchor?.setAttribute("href", this.getAttribute("href") || "#");
    }

}
