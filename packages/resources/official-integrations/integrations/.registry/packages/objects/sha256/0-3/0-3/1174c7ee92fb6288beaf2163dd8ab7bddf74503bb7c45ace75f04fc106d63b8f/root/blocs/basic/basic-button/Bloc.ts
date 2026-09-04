import { basicColorSchemeCss } from "./colorSchemes";
import css from "./style.css" with { type: "text" };

export class BasicButton extends HTMLElement {
    iconSlots;

    constructor() {
        super();
        const shadowRoot = this.attachShadow({ mode: "open" });
        shadowRoot.innerHTML = `
            <style>
                ${basicColorSchemeCss()}
                ${css}
            </style>
            <span part="control">
                <slot name="icon-start"></slot>
                <slot></slot>
                <slot name="icon-end"></slot>
            </span>
        `;
        this.iconSlots = Array.from(shadowRoot.querySelectorAll('slot[name^="icon-"]'));
        for (const slot of this.iconSlots) {
            slot.addEventListener("slotchange", () => this.syncIconSlot(slot));
        }
    }

    connectedCallback() {
        for (const slot of this.iconSlots) {
            this.syncIconSlot(slot);
        }
    }

    syncIconSlot(slot) {
        const position = slot.name === "icon-start" ? "start" : "end";
        const icons = slot.assignedElements();
        this.toggleAttribute(`has-icon-${position}`, icons.length > 0);
        for (const icon of icons) {
            icon.setAttribute("aria-hidden", "true");
            icon.setAttribute("focusable", "false");
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicButton);
