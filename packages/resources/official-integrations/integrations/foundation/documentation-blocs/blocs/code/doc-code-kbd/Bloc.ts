import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    constructor() {
        super({ css, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
