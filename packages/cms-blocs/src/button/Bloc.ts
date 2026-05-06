import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.addEventListener('click', this._onClick);
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick);
    }

    private _onClick = (e: MouseEvent) => {
        if (this.hasAttribute("disabled")) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
        }

        const href = this.getAttribute("href");
        if (!href) return;

        if (this.getAttribute("target") === "_blank") {
            window.open(href, "_blank", "noopener,noreferrer");
        } else {
            window.location.href = href;
        }
    };

}
