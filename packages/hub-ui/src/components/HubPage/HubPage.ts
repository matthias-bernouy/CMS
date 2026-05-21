import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };

/**
 * `<hub-page>` — page shell: content padding + max-width + a header row.
 * Slots: `title` (breadcrumb / h1 / subtitle as direct children), `actions`
 * (header buttons, right-aligned), default (page body).
 */
export class HubPage extends Component {
    constructor() {
        super({
            css: css as unknown as string,
            template: `
                <header part="header">
                    <div class="main"><slot name="title"></slot></div>
                    <div class="actions"><slot name="actions"></slot></div>
                </header>
                <div part="body"><slot></slot></div>`,
        });
    }
}

if (!customElements.get("hub-page")) customElements.define("hub-page", HubPage);
