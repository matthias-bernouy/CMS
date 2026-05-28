import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

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
        const href = this.getAttribute('href');
        if (!href) return;
        const target = e.target as HTMLElement;
        if (target.closest('a,button')) return;
        if (this.getAttribute('target') === '_blank') {
            window.open(href, '_blank', 'noopener,noreferrer');
        } else {
            window.location.href = href;
        }
    };

}
