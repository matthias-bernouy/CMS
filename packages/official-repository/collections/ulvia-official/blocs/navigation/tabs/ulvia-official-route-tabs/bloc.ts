import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    constructor() {
        super({ css, template });
        this.shadowRoot?.querySelector("nav")?.setAttribute("aria-label", "Page navigation");
    }
}
