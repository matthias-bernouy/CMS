import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };

/** `<hub-hint>` — muted, small helper/description text. */
export class HubHint extends Component {
    constructor() {
        super({ css: css as unknown as string, template: `<slot></slot>` });
    }
}

if (!customElements.get("hub-hint")) customElements.define("hub-hint", HubHint);
