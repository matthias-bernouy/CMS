import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._burger = this.shadowRoot?.querySelector('.burger-toggle') ?? null;
        this._burger?.addEventListener('click', this.onClick);
        this.updateCSS();
    }

    updateCSS(){
        this.registerCSSVariables({
            "navbar-breakpoint": this.getAttribute("navbar-breakpoint") || "500px"
        })
    }

    disconnectedCallback(): void {
        this._burger?.removeEventListener('click', this.onClick);
        this._burger = null;
    }

    private _burger: Element | null = null;

    onClick = () => {
        this.toggleAttribute('open');
    }

}
