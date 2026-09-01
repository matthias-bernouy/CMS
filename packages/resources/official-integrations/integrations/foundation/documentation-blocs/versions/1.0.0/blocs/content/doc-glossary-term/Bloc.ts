import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _term = null;
    _tooltip = null;
    _positionFrame = 0;

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this._term = this.shadowRoot?.querySelector(".term") ?? null;
        this._tooltip = this.shadowRoot?.querySelector(".tooltip") ?? null;
        this._term?.addEventListener("mouseenter", this._positionTooltip);
        this._term?.addEventListener("focusin", this._positionTooltip);
        window.addEventListener("resize", this._positionTooltip);
        this._positionFrame = requestAnimationFrame(this._positionTooltip);
    }

    disconnectedCallback() {
        this._term?.removeEventListener("mouseenter", this._positionTooltip);
        this._term?.removeEventListener("focusin", this._positionTooltip);
        window.removeEventListener("resize", this._positionTooltip);
        cancelAnimationFrame(this._positionFrame);
    }

    _positionTooltip = () => {
        if (!this._tooltip) {
            return;
        }
        this._tooltip.style.setProperty("--gt-viewport-shift", "0px");
        const bounds = this._tooltip.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const leftGap = 8 - bounds.left;
        const rightGap = bounds.right - (viewportWidth - 8);
        const shift = leftGap > 0 ? leftGap : rightGap > 0 ? -rightGap : 0;
        this._tooltip.style.setProperty("--gt-viewport-shift", `${Math.round(shift)}px`);
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
