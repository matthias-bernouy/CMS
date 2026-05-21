import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };

/** `<hub-code>` — inline code token. `<hub-code block>` — a code block
 *  (multi-line, scrollable). */
export class HubCode extends Component {
    constructor() {
        super({ css: css as unknown as string, template: `<code part="code"><slot></slot></code>` });
    }
}

if (!customElements.get("hub-code")) customElements.define("hub-code", HubCode);
