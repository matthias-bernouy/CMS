import { basicColorSchemeCss } from "./colorSchemes";
import css from "./style.css" with { type: "text" };

export class BasicButton extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `
            <style>
                ${basicColorSchemeCss()}
                ${css}
            </style>
            <slot></slot>
        `;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicButton);
